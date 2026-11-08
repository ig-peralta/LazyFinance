import type { TagSummary } from "@lazyfinance/contracts";
import type {
  BudgetSpendingEvidenceInput,
  SpendingEvidenceRecord,
  SummarySpendingEvidenceInput,
} from "@lazyfinance/contracts/internal";
import { Inject, Injectable } from "@nestjs/common";
import { TRPCError } from "@trpc/server";
import { type Kysely, sql } from "kysely";
import { RLS_DB } from "../../database/tokens";
import { toCursorPage } from "../../pagination/cursor-page";
import {
  decodeSelectionCursor,
  encodeSelectionCursor,
} from "../../pagination/selection-cursor";
import { purchaseRecovery } from "../expense-adjustment/expense-adjustment-sql";
import {
  type BudgetSpendingTables,
  budgetSpendingBounds,
  budgetSpendingQuery,
} from "../objective/budget-spending-query";
import { budgetInstant, budgetTimestamp } from "../objective/budget-sql";
import { movementPeriod } from "../query-period";
import { eligibleSpending } from "./spending-sql";

const aggregateColumns = [
  sql<string>`coalesce(sum(m.amount),0)::text`.as("amount"),
  sql<number>`count(m.id)::int`.as("count"),
  sql<string>`coalesce(sum(pa.refund_amount::numeric),0)::text`.as(
    "refundAmount",
  ),
  sql<string>`coalesce(sum(pa.reimbursement_amount::numeric),0)::text`.as(
    "reimbursementAmount",
  ),
  sql<number>`coalesce(sum(pa.adjustment_review_count),0)::int`.as(
    "adjustmentReviewCount",
  ),
] as const;

const evidenceColumns = [
  "m.id",
  "m.amount",
  "m.type",
  "m.merchant",
  "m.description",
  "m.tagDecisionOrigin",
  "m.tagRuleId",
  "m.reviewStatus",
  "a.id as accountId",
  "a.alias as accountAlias",
  "a.type as accountType",
  "a.currency",
  budgetTimestamp(sql.ref<Date>("m.bookedAt")).as("bookedAt"),
  sql<TagSummary | null>`CASE WHEN t.id IS NULL THEN NULL ELSE jsonb_build_object('id',t.id,'name',t.name,'color',t.color) END`.as(
    "tag",
  ),
  sql<string>`pa.refund_amount`.as("refundAmount"),
  sql<string>`pa.reimbursement_amount`.as("reimbursementAmount"),
  sql<number>`pa.adjustment_review_count`.as("adjustmentReviewCount"),
] as const;

const zero = {
  amount: "0.00",
  count: 0,
  refundAmount: "0.00",
  reimbursementAmount: "0.00",
  adjustmentReviewCount: 0,
};

@Injectable()
export class SpendingEvidenceRepository {
  constructor(
    @Inject(RLS_DB) private readonly db: Kysely<BudgetSpendingTables>,
  ) {}

  async summary(input: SummarySpendingEvidenceInput) {
    let query = this.db
      .selectFrom("finance.transaction as m")
      .innerJoin("finance.account as a", "a.id", "m.accountId")
      .leftJoin("finance.tag as t", "t.id", "m.tagId")
      .leftJoinLateral(
        purchaseRecovery(input.adjustmentsAsOf).as("pa"),
        (join) => join.onTrue(),
      )
      .where(movementPeriod(input))
      .where(eligibleSpending());
    if (input.tagId !== undefined)
      query = query.where(
        "m.tagId",
        input.tagId === null ? "is" : "=",
        input.tagId,
      );
    const totals = await query
      .select(aggregateColumns)
      .executeTakeFirstOrThrow();
    const untagged = await query
      .where("m.tagId", "is", null)
      .select(aggregateColumns)
      .executeTakeFirstOrThrow();
    const bounds = await this.db
      .selectNoFrom([
        budgetTimestamp(budgetInstant(input.start)).as("start"),
        budgetTimestamp(budgetInstant(input.end)).as("end"),
      ])
      .executeTakeFirstOrThrow();
    const tracking = {
      ...bounds,
      asOf: input.asOf,
      adjustmentsAsOf: input.adjustmentsAsOf,
      archivedAt: null,
      revisionId: null,
    };
    const { cursor, limit, ...selection } = input;
    const key = JSON.stringify({ summary: selection, tracking });
    if (cursor) {
      const boundary = decodeSelectionCursor(cursor, key);
      query = query.where(
        sql<boolean>`(m.booked_at,m.id) < (${boundary.bookedAt}::timestamptz,${boundary.id}::uuid)`,
      );
    }
    const rows = await query
      .select(evidenceColumns)
      .orderBy("m.bookedAt", "desc")
      .orderBy("m.id", "desc")
      .limit(limit + 1)
      .execute();
    return {
      ...toCursorPage(rows, limit, (row) =>
        encodeSelectionCursor(key, row.bookedAt, row.id),
      ),
      totals,
      untagged,
      tracking,
    };
  }

  async budget(input: BudgetSpendingEvidenceInput) {
    const base = budgetSpendingQuery(this.db, {
      windows: [input.window],
      asOf: input.asOf,
    });
    const bounds = budgetSpendingBounds();
    const scope = await base
      .select([
        budgetTimestamp(bounds.start).as("start"),
        budgetTimestamp(bounds.end).as("end"),
        budgetTimestamp(sql.ref<Date | null>("o.archivedAt")).as("archivedAt"),
      ])
      .limit(1)
      .executeTakeFirst();
    if (!scope)
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Budget is not tracked in this period",
      });
    const tracking = {
      ...scope,
      asOf: input.asOf,
      adjustmentsAsOf: input.adjustmentsAsOf,
      revisionId: input.window.revisionId,
    };
    let query = base
      .innerJoin("finance.account as a", "a.id", "m.accountId")
      .leftJoin("finance.tag as t", "t.id", "m.tagId")
      .leftJoinLateral(
        purchaseRecovery(input.adjustmentsAsOf).as("pa"),
        (join) => join.onTrue(),
      )
      .where("m.id", "is not", null);
    const totals = await query
      .select(aggregateColumns)
      .executeTakeFirstOrThrow();
    const { cursor, limit, ...selection } = input;
    const key = JSON.stringify({ budget: selection, tracking });
    if (cursor) {
      const boundary = decodeSelectionCursor(cursor, key);
      query = query.where(
        sql<boolean>`(m.booked_at,m.id) < (${boundary.bookedAt}::timestamptz,${boundary.id}::uuid)`,
      );
    }
    const rows = await query
      .select(evidenceColumns)
      .$narrowType<SpendingEvidenceRecord>()
      .orderBy("m.bookedAt", "desc")
      .orderBy("m.id", "desc")
      .limit(limit + 1)
      .execute();
    return {
      ...toCursorPage(rows, limit, (row) =>
        encodeSelectionCursor(key, row.bookedAt, row.id),
      ),
      totals,
      untagged: zero,
      tracking,
    };
  }
}
