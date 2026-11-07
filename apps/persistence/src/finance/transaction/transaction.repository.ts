import type { TagSummary } from "@lazyfinance/contracts";
import type { PeriodInput } from "@lazyfinance/contracts/internal";
import { Inject, Injectable } from "@nestjs/common";
import { type Kysely, sql } from "kysely";
import { RLS_DB } from "../../database/tokens";
import type { AccountTables } from "../account/account.tables";
import type { IncomeReceiptTables } from "../income-receipt/income-receipt.tables";
import { movementPeriod } from "../query-period";
import type { TagTables } from "../tag/tag.tables";
import type { TransactionTables } from "./transaction.tables";

type Tables = TransactionTables &
  AccountTables &
  TagTables &
  IncomeReceiptTables;

@Injectable()
export class TransactionRepository {
  constructor(@Inject(RLS_DB) private readonly db: Kysely<Tables>) {}

  recent() {
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
        "t.id as joinedTagId",
        "t.name as tagName",
        "t.color as tagColor",
      ])
      .where("m.removedAt", "is", null)
      .orderBy("m.bookedAt", "desc")
      .orderBy("m.id", "desc")
      .limit(10)
      .execute();
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
    return this.db
      .selectFrom("finance.transaction as m")
      .leftJoin("finance.income_receipt as r", "r.transactionId", "m.id")
      .select([
        "m.type",
        "m.isInternalMovement",
        "m.reviewStatus",
        sql<boolean>`r.transaction_id IS NOT NULL`.as("hasReceipt"),
        sql<string>`sum(m.amount)::text`.as("amount"),
        sql<number>`count(*)::int`.as("count"),
      ])
      .where(movementPeriod(period))
      .where("m.removedAt", "is", null)
      .groupBy(["m.type", "m.isInternalMovement", "m.reviewStatus"])
      .groupBy(sql`r.transaction_id IS NOT NULL`);
  }
}
