import {
  type BudgetDetail,
  type BudgetHistoryInput,
  type BudgetHistoryPage,
  type BudgetProgress,
  type BudgetVersionInput,
  BudgetVersionInputSchema,
  CreateBudgetInputSchema,
  type ObjectiveSummary,
  UpdateBudgetInputSchema,
} from "@lazyfinance/contracts";
import { Injectable } from "@nestjs/common";
import { TRPCError } from "@trpc/server";
import { PersistenceClient } from "../persistence/persistence.client";
import { fromCents, toCents } from "../utils/money";
import { monthBounds } from "../utils/period";
import { santiagoMonth } from "../utils/santiago-time";
import { parseInput } from "../validation/parse-input";
import { reportedBudgetPeriod } from "./budget-period";
import { budgetSchedule, nextBudgetRevision } from "./budget-policy";
import { compareObjectiveBoundaries } from "./objective-time";

@Injectable()
export class ObjectivesService {
  constructor(private readonly persistence: PersistenceClient) {}

  getForUser(userId: string): Promise<ObjectiveSummary[]> {
    return this.persistence.user(userId).objectives.list.query();
  }

  getBudgetForUser(userId: string, id: string): Promise<BudgetDetail> {
    return this.persistence.user(userId).objectives.budget.query({ id });
  }

  getBudgetHistoryForUser(
    userId: string,
    input: BudgetHistoryInput,
  ): Promise<BudgetHistoryPage> {
    return this.persistence.user(userId).objectives.budgetHistory.query(input);
  }

  async createBudgetForUser(
    userId: string,
    value: unknown,
    now = new Date(),
  ): Promise<BudgetDetail> {
    const input = parseInput(
      CreateBudgetInputSchema,
      value,
      "Invalid budget input",
    );
    return this.persistence.user(userId).objectives.createBudget.mutate({
      budget: {
        name: input.name,
        amount: fromCents(toCents(input.amount)),
        tagIds: input.tagIds,
        ...budgetSchedule(input.schedule, now),
      },
    });
  }

  async updateBudgetForUser(
    userId: string,
    value: unknown,
    now = new Date(),
  ): Promise<BudgetDetail> {
    const input = parseInput(
      UpdateBudgetInputSchema,
      value,
      "Invalid budget input",
    );
    const detail = await this.getBudgetForUser(userId, input.id);
    if (detail.version !== input.expectedVersion)
      throw new TRPCError({
        code: "CONFLICT",
        message: "Budget version changed",
      });
    if (detail.archivedAt)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Archived budgets cannot be changed",
      });

    const current = detail.effective ?? detail.pending;
    if (!current || current.kind !== "time_based" || !current.startDate)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Unsupported budget configuration",
      });

    const wasStarted =
      compareObjectiveBoundaries(current.startDate, now.toISOString()) <= 0;
    if (wasStarted && input.budget.schedule)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "A started budget's schedule cannot be changed",
      });

    const schedule = input.budget.schedule
      ? budgetSchedule(input.budget.schedule, now)
      : {
          isRecurring: current.isRecurring,
          period: current.period,
          startDate: current.startDate,
          endDate: current.endDate,
        };
    if (
      typeof schedule.isRecurring !== "boolean" ||
      (schedule.period !== null &&
        schedule.period !== "monthly" &&
        schedule.period !== "yearly")
    )
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Unsupported budget period",
      });

    const effectiveFrom = wasStarted
      ? nextBudgetRevision(current, now)
      : schedule.startDate;
    return this.persistence.user(userId).objectives.updateBudget.mutate({
      id: input.id,
      expectedVersion: input.expectedVersion,
      wasStarted,
      effectiveFrom,
      budget: {
        name: input.budget.name,
        amount: fromCents(toCents(input.budget.amount)),
        tagIds: input.budget.tagIds,
        ...schedule,
        isRecurring: schedule.isRecurring,
        period: schedule.period,
      },
    });
  }

  archiveBudgetForUser(
    userId: string,
    value: BudgetVersionInput,
  ): Promise<BudgetDetail> {
    const input = parseInput(
      BudgetVersionInputSchema,
      value,
      "Invalid budget input",
    );
    return this.persistence.user(userId).objectives.archiveBudget.mutate(input);
  }

  async getSpendingProgressForUser(
    userId: string,
    month: string,
    now = new Date(),
  ): Promise<BudgetProgress[]> {
    if (month > santiagoMonth(now)) return [];

    const { end: monthEnd } = monthBounds(month);
    const objectives = await this.persistence
      .user(userId)
      .objectives.forPeriod.query({
        before: monthEnd,
      });
    const candidates = objectives.flatMap((objective) => {
      const window = reportedBudgetPeriod(objective, month, now);
      if (!window) return [];

      return [{ objective, window }];
    });
    if (candidates.length === 0) return [];

    const totals = await this.persistence
      .user(userId)
      .objectives.spending.query({
        windows: candidates.map(({ objective, window }) => ({
          id: objective.id,
          revisionId: objective.revisionId,
          start: window.start,
          end: window.end,
        })),
        asOf: month === santiagoMonth(now) ? now.toISOString() : undefined,
        adjustmentsAsOf: now.toISOString(),
      });
    const amounts = new Map(totals.map((fact) => [fact.id, fact]));

    return candidates.flatMap(({ objective, window }) => {
      const fact = amounts.get(objective.id);
      // An objective removed between the two reads is no longer reportable.
      if (!fact || fact.revisionId !== objective.revisionId) return [];
      const gross = -toCents(fact.amount);
      const refunds = toCents(fact.refundAmount);
      const reimbursements = toCents(fact.reimbursementAmount);
      const spent = gross - refunds - reimbursements;
      const limit = toCents(objective.amount);

      return [
        {
          id: objective.id,
          name: objective.name,
          month,
          period: window.period,
          limit: fromCents(limit),
          spent: fromCents(spent),
          grossSpent: fromCents(gross),
          refunds: fromCents(refunds),
          reimbursements: fromCents(reimbursements),
          unresolvedAdjustmentCount: fact.adjustmentReviewCount,
          adjustmentsAsOf: now.toISOString(),
          remaining: fromCents(limit - spent),
          percentage: Number((spent * 100n) / limit),
          revisionId: fact.revisionId,
          tracking: {
            start: fact.start,
            end: fact.end,
            archivedAt: fact.archivedAt,
          },
        },
      ];
    });
  }
}
