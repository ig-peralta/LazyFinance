import type {
  BudgetContributionsInput,
  SpendingContributionsInput,
} from "@lazyfinance/contracts";
import type {
  SpendingAggregateFact,
  SpendingEvidenceFacts,
} from "@lazyfinance/contracts/internal";
import { Injectable } from "@nestjs/common";
import { TRPCError } from "@trpc/server";
import { reportedBudgetPeriod } from "../objectives/budget-period";
import { PersistenceClient } from "../persistence/persistence.client";
import { fromCents, toCents } from "../utils/money";
import { checkedMonth } from "../utils/month-query";
import { monthBounds } from "../utils/period";
import { santiagoMonth } from "../utils/santiago-time";
import { movementResponse } from "./movement-response";

function amounts(fact: Omit<SpendingAggregateFact, "count">) {
  const gross = -toCents(fact.amount),
    refunds = toCents(fact.refundAmount),
    reimbursements = toCents(fact.reimbursementAmount);
  return {
    grossSpending: fromCents(gross),
    refunds: fromCents(refunds),
    reimbursements: fromCents(reimbursements),
    spending: fromCents(gross - refunds - reimbursements),
    unresolvedAdjustmentCount: fact.adjustmentReviewCount,
  };
}

function response(
  facts: SpendingEvidenceFacts,
  month: string,
  includesUntagged: boolean,
) {
  return {
    pageInfo: facts.pageInfo,
    tracking: facts.tracking,
    month,
    basis: "purchase_attribution" as const,
    includesUntagged,
    totals: { ...amounts(facts.totals), count: facts.totals.count },
    untaggedInSelection: {
      ...amounts(facts.untagged),
      count: facts.untagged.count,
    },
    items: facts.items.map(
      ({
        refundAmount,
        reimbursementAmount,
        adjustmentReviewCount,
        ...movement
      }) => ({
        ...movementResponse(movement),
        ...amounts({
          amount: movement.amount,
          refundAmount,
          reimbursementAmount,
          adjustmentReviewCount,
        }),
      }),
    ),
  };
}

@Injectable()
export class SpendingEvidenceService {
  constructor(private readonly persistence: PersistenceClient) {}

  private selection(input: SpendingContributionsInput) {
    if (input.cursor && (!input.asOf || !input.adjustmentsAsOf))
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Continue with the previous page's asOf and adjustmentsAsOf",
      });
    const month = checkedMonth(input.month ?? santiagoMonth(new Date()));
    const adjustmentsAsOf = input.adjustmentsAsOf ?? new Date().toISOString();
    const asOf = input.asOf ?? adjustmentsAsOf;
    if (
      Date.parse(asOf) > Date.now() ||
      Date.parse(adjustmentsAsOf) > Date.now()
    )
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Observation cannot be in the future",
      });
    return {
      month,
      asOf,
      adjustmentsAsOf,
      cursor: input.cursor,
      limit: input.limit,
    };
  }

  async summary(userId: string, input: SpendingContributionsInput) {
    const { month, ...selection } = this.selection(input);
    const facts = await this.persistence
      .user(userId)
      .transactions.spendingEvidence.query({
        ...selection,
        ...monthBounds(month),
        tagId: input.tagId,
      });
    return response(
      facts,
      month,
      input.tagId === undefined || input.tagId === null,
    );
  }

  async budget(userId: string, input: BudgetContributionsInput) {
    const { month, ...selection } = this.selection(input);
    const client = this.persistence.user(userId);
    const [objective] = await client.objectives.forPeriod.query({
      before: monthBounds(month).end,
      id: input.id,
    });
    if (!objective)
      throw new TRPCError({ code: "NOT_FOUND", message: "Budget not found" });
    if (objective.revisionId !== input.revisionId)
      throw new TRPCError({
        code: "CONFLICT",
        message: "Budget revision changed; reload progress",
      });
    const window = reportedBudgetPeriod(
      objective,
      month,
      new Date(selection.asOf),
    );
    if (!window)
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Budget is not tracked in this period",
      });
    const facts = await client.objectives.budgetEvidence.query({
      ...selection,
      window: {
        id: input.id,
        revisionId: input.revisionId,
        start: window.start,
        end: window.end,
      },
    });
    return response(facts, month, false);
  }
}
