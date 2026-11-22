import type {
  SavingsEvidenceInput,
  SavingsGoal,
  SavingsProgressInput,
} from "@lazyfinance/contracts";
import { Injectable } from "@nestjs/common";
import { TRPCError } from "@trpc/server";
import { coversObservedMonth } from "../finance/history-coverage";
import { PersistenceClient } from "../persistence/persistence.client";
import { fromCents, toCents } from "../utils/money";
import { checkedMonth } from "../utils/month-query";
import { monthBounds } from "../utils/period";
import { santiagoMonth } from "../utils/santiago-time";
import { SavingsGoalsService } from "./savings-goals.service";
import { savingsCashEffect } from "./savings-policy";

export function savingsWindow(goal: SavingsGoal, month: string) {
  const end = monthBounds(month).end;
  if (goal.kind === "amount_based")
    return { start: null, end, period: "cumulative" as const };
  if (goal.isRecurring && goal.period === "monthly")
    return { ...monthBounds(month), period: "monthly" as const };
  if (goal.isRecurring && goal.period === "yearly")
    return {
      start: `${month.slice(0, 4)}-01-01 00:00:00`,
      end,
      period: "yearly" as const,
    };
  if (goal.isRecurring === false && goal.startDate && goal.endDate)
    return { start: goal.startDate, end, period: "fixed" as const };
  throw new TRPCError({
    code: "BAD_REQUEST",
    message: "Unsupported savings schedule; target remains available",
  });
}

@Injectable()
export class SavingsProgressService {
  constructor(
    private readonly persistence: PersistenceClient,
    private readonly goals: SavingsGoalsService,
  ) {}

  private async selection(
    userId: string,
    input: SavingsProgressInput,
    monthly = false,
  ) {
    const month = checkedMonth(input.month ?? santiagoMonth(new Date()));
    const asOf = input.asOf ?? new Date().toISOString();
    if (Date.parse(asOf) > Date.now())
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Observation cannot be in the future",
      });
    const goal = await this.goals.detail(userId, input.id);
    const window = monthly
      ? { ...monthBounds(month), period: "monthly" as const }
      : savingsWindow(goal, month);
    const { start, end, period } = window;
    return {
      goal,
      month,
      period,
      query: { id: input.id, expectedVersion: goal.version, start, end, asOf },
    };
  }

  async progress(userId: string, input: SavingsProgressInput) {
    const selection = await this.selection(userId, input);
    const {
      facts,
      contributions,
      withdrawals,
      contributionCount,
      withdrawalCount,
      pendingCount,
    } = await this.measured(userId, selection);
    const net = contributions - withdrawals,
      target = toCents(selection.goal.amount);
    return {
      goal: selection.goal,
      month: selection.month,
      period: selection.period,
      basis: "recorded_allocations" as const,
      tracking: facts.tracking,
      contributions: fromCents(contributions),
      withdrawals: fromCents(withdrawals),
      netContributions: fromCents(net),
      remaining: fromCents(target - net),
      percentage: fromCents((net * 10000n) / target),
      contributionCount,
      withdrawalCount,
      pendingCount,
      historyCoverage: facts.historyCoverage,
    };
  }

  private async measured(
    userId: string,
    selection: Awaited<ReturnType<SavingsProgressService["selection"]>>,
  ) {
    const facts = await this.persistence
      .user(userId)
      .objectives.savingsFacts.query(selection.query);
    let contributions = 0n,
      withdrawals = 0n,
      contributionCount = 0,
      withdrawalCount = 0,
      pendingCount = 0;
    for (const row of facts.groups) {
      const effect = savingsCashEffect(row);
      if (effect.status === "pending") pendingCount += row.count;
      if (effect.status !== "applied") continue;
      if (effect.kind === "contribution") {
        contributions += toCents(effect.amount);
        contributionCount += row.count;
      } else {
        withdrawals -= toCents(effect.amount);
        withdrawalCount += row.count;
      }
    }
    return {
      facts,
      contributions,
      withdrawals,
      contributionCount,
      withdrawalCount,
      pendingCount,
    };
  }

  async monthly(userId: string, input: SavingsProgressInput) {
    const selection = await this.selection(userId, input, true);
    const { facts, contributions, withdrawals, pendingCount } =
      await this.measured(userId, selection);
    return {
      id: selection.goal.id,
      name: selection.goal.name,
      month: selection.month,
      basis: "recorded_allocations" as const,
      tracking: facts.tracking,
      historyCoverage: facts.historyCoverage,
      incompleteCoverage:
        !facts.historyCoverage.length ||
        facts.historyCoverage.some(
          (account) =>
            !coversObservedMonth(account, selection.month, facts.tracking.asOf),
        ),
      contributions: fromCents(contributions),
      withdrawals: fromCents(withdrawals),
      netContributions: fromCents(contributions - withdrawals),
      pendingCount,
    };
  }

  async overview(userId: string, month: string) {
    const selected = checkedMonth(month);
    const asOf = new Date().toISOString();
    const goals = (
      await this.persistence.user(userId).objectives.list.query()
    ).filter((objective) => objective.intent === "saving");
    const progress = await Promise.all(
      goals.slice(0, 12).map(async (goal) => {
        const result = await this.progress(userId, {
          id: goal.id,
          month: selected,
          asOf,
        });
        return {
          id: goal.id,
          name: goal.name,
          period: result.period,
          target: goal.amount,
          remaining: result.remaining,
          contributions: result.contributions,
          withdrawals: result.withdrawals,
          netContributions: result.netContributions,
          pendingCount: result.pendingCount,
          incompleteCoverage:
            !result.historyCoverage.length ||
            result.historyCoverage.some(
              (account) => !coversObservedMonth(account, selected, asOf),
            ),
        };
      }),
    );
    return {
      month: selected,
      asOf,
      totalGoals: goals.length,
      hasMore: goals.length > 12,
      goals: progress,
    };
  }

  async evidence(userId: string, input: SavingsEvidenceInput) {
    if (input.cursor && !input.asOf)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Continue with the previous page's asOf",
      });
    const selection = await this.selection(userId, input);
    const page = await this.persistence
      .user(userId)
      .objectives.savingsEvidence.query({
        ...selection.query,
        cursor: input.cursor,
        limit: input.limit,
      });
    return {
      ...page,
      items: page.items.map((row) => ({
        ...row,
        effect: savingsCashEffect(row),
      })),
    };
  }
}
