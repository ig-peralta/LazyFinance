import type { TagSummary, TransactionsInput } from "@lazyfinance/contracts";
import type { PeriodInput } from "@lazyfinance/contracts/internal";
import { Inject, Injectable } from "@nestjs/common";
import { type Kysely, sql } from "kysely";
import { RLS_DB } from "../../database/tokens";
import { toCursorPage } from "../../pagination/cursor-page";
import type { AccountTables } from "../account/account.tables";
import {
  creditRecovery,
  purchaseRecovery,
} from "../expense-adjustment/expense-adjustment-sql";
import type { IncomeReceiptTables } from "../income-receipt/income-receipt.tables";
import { budgetInstant } from "../objective/budget-sql";
import { movementPeriod } from "../query-period";
import type { TagTables } from "../tag/tag.tables";
import type { TransactionTables } from "./transaction.tables";
import {
  decodeTransactionCursor,
  encodeTransactionCursor,
} from "./transaction-cursor";

type Tables = TransactionTables &
  AccountTables &
  TagTables &
  IncomeReceiptTables;

@Injectable()
export class TransactionRepository {
  constructor(@Inject(RLS_DB) private readonly db: Kysely<Tables>) {}

  recent() {
    return this.movementQuery().limit(10).execute();
  }

  async list(input: TransactionsInput) {
    const cursor = input.cursor
      ? decodeTransactionCursor(input.cursor, input)
      : undefined;
    let query = this.movementQuery().select(
      // pg's Date parser truncates microseconds. Keep the exact SQL boundary
      // separately; public bookedAt retains the existing wire representation.
      sql<string>`to_char(m.booked_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`.as(
        "cursorBookedAt",
      ),
    );

    if (input.accountId)
      query = query.where("m.accountId", "=", input.accountId);
    if (input.bookedFrom)
      query = query.where(
        "m.bookedAt",
        ">=",
        budgetInstant(`${input.bookedFrom} 00:00:00`),
      );
    if (input.bookedBefore)
      query = query.where(
        "m.bookedAt",
        "<",
        budgetInstant(`${input.bookedBefore} 00:00:00`),
      );
    if (input.tagId !== undefined)
      query = query.where(
        "m.tagId",
        input.tagId === null ? "is" : "=",
        input.tagId,
      );
    if (input.type) query = query.where("m.type", "=", input.type);
    if (input.isInternalMovement !== undefined)
      query = query.where(
        "m.isInternalMovement",
        input.isInternalMovement === null ? "is" : "=",
        input.isInternalMovement,
      );
    if (input.merchant)
      query = query.where(
        "m.merchant",
        "ilike",
        `%${input.merchant.replace(/[\\%_]/g, "\\$&")}%`,
      );
    if (cursor)
      query = query.where(
        sql<boolean>`(m.booked_at, m.id) < (${cursor.bookedAt}::timestamptz, ${cursor.id}::uuid)`,
      );

    const rows = await query.limit(input.limit + 1).execute();
    const page = toCursorPage(rows, input.limit, (row) =>
      encodeTransactionCursor(
        {
          bookedAt: row.cursorBookedAt,
          id: row.id,
        },
        input,
      ),
    );

    return {
      ...page,
      items: page.items.map(
        ({ cursorBookedAt: _cursorBookedAt, ...row }) => row,
      ),
    };
  }

  private movementQuery() {
    return this.db
      .selectFrom("finance.transaction as m")
      .innerJoin("finance.account as a", "a.id", "m.accountId")
      .leftJoin("finance.tag as t", "t.id", "m.tagId")
      .select([
        "m.id",
        "m.bookedAt",
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
      ])
      .select(
        sql<TagSummary | null>`CASE WHEN t.id IS NULL THEN NULL ELSE
        jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color) END`.as(
          "tag",
        ),
      )
      .where("m.removedAt", "is", null)
      .orderBy("m.bookedAt", "desc")
      .orderBy("m.id", "desc");
  }

  aggregates(period: PeriodInput) {
    return this.aggregateQuery(period).execute();
  }

  taggedAggregates(period: PeriodInput) {
    return this.aggregateQuery(period)
      .leftJoin("finance.tag as t", "t.id", "m.tagId")
      .select(
        sql<TagSummary | null>`CASE WHEN t.id IS NULL THEN NULL ELSE
        jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color) END`.as(
          "tag",
        ),
      )
      .groupBy("t.id")
      .limit(50001)
      .execute();
  }

  private aggregateQuery(period: PeriodInput) {
    const hasReceipt = sql<boolean>`r.transaction_id IS NOT NULL AND ca.reserved_credit_amount::numeric = 0`;
    return this.db
      .selectFrom("finance.transaction as m")
      .leftJoin("finance.income_receipt as r", "r.transactionId", "m.id")
      .leftJoinLateral(
        purchaseRecovery(period.adjustmentsAsOf).as("pa"),
        (join) => join.onTrue(),
      )
      .leftJoinLateral(
        creditRecovery(period.adjustmentsAsOf).as("ca"),
        (join) => join.onTrue(),
      )
      .select([
        "m.type",
        "m.isInternalMovement",
        "m.reviewStatus",
        hasReceipt.as("hasReceipt"),
        sql<string>`sum(m.amount)::text`.as("amount"),
        sql<number>`count(*)::int`.as("count"),
        sql<string>`sum(pa.refund_amount::numeric)::text`.as("refundAmount"),
        sql<string>`sum(pa.reimbursement_amount::numeric)::text`.as(
          "reimbursementAmount",
        ),
        sql<number>`sum(pa.adjustment_review_count)::int`.as(
          "purchaseAdjustmentReviewCount",
        ),
        sql<string>`sum(ca.reserved_credit_amount::numeric)::text`.as(
          "reservedCreditAmount",
        ),
        sql<string>`sum(ca.expense_credit_amount::numeric)::text`.as(
          "expenseCreditAmount",
        ),
        sql<number>`count(*) FILTER (WHERE ca.expense_credit_amount::numeric > 0)::int`.as(
          "expenseCreditCount",
        ),
        sql<number>`sum(ca.adjustment_review_count)::int`.as(
          "creditAdjustmentReviewCount",
        ),
        sql<number>`count(*) FILTER (WHERE m.type = 'credit' AND NOT (${hasReceipt})
          AND m.amount > ca.reserved_credit_amount::numeric)::int`.as(
          "unclassifiedCreditCount",
        ),
      ])
      .where(movementPeriod(period))
      .where("m.removedAt", "is", null)
      .groupBy(["m.type", "m.isInternalMovement", "m.reviewStatus"])
      .groupBy(hasReceipt);
  }
}
