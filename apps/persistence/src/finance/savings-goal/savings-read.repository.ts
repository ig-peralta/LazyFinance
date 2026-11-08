import type { TagSummary } from "@lazyfinance/contracts";
import type {
  SavingsEvidenceRead,
  SavingsRead,
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
import type { AccountTables } from "../account/account.tables";
import { budgetInstant, budgetTimestamp } from "../objective/budget-sql";
import type { ObjectiveTables } from "../objective/objective.tables";
import type { ObjectiveTagTables } from "../objective-tag/objective-tag.tables";
import type { TagTables } from "../tag/tag.tables";
import type { TransactionTables } from "../transaction/transaction.tables";

type Tables = ObjectiveTables &
  ObjectiveTagTables &
  AccountTables &
  TransactionTables &
  TagTables;

@Injectable()
export class SavingsReadRepository {
  constructor(@Inject(RLS_DB) private readonly db: Kysely<Tables>) {}

  private async scope(input: SavingsRead) {
    const start = sql<Date | null>`greatest(${input.start ? budgetInstant(input.start) : sql`NULL::timestamptz`},o.start_date)`;
    const end = sql<Date>`least(${budgetInstant(input.end)},o.end_date,o.archived_at)`;
    const row = await this.db
      .selectFrom("finance.objective as o")
      .select([
        "o.goalVersion",
        budgetTimestamp(start).as("start"),
        budgetTimestamp(end).as("end"),
        budgetTimestamp(sql.ref<Date | null>("o.archivedAt")).as("archivedAt"),
        sql<boolean>`${start} IS NOT NULL AND ${start} >= ${end}`.as("empty"),
      ])
      .where("o.id", "=", input.id)
      .where("o.intent", "=", "saving")
      .executeTakeFirst();
    if (!row)
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Savings goal not found",
      });
    if (row.goalVersion !== input.expectedVersion)
      throw new TRPCError({
        code: "CONFLICT",
        message: "Savings goal changed; reload",
      });
    return {
      start: row.start,
      end: row.end,
      archivedAt: row.archivedAt,
      empty: row.empty,
      asOf: input.asOf,
    };
  }

  private movements(
    input: SavingsRead,
    tracking: Awaited<ReturnType<SavingsReadRepository["scope"]>>,
  ) {
    return this.db
      .selectFrom("finance.transaction as m")
      .innerJoin("finance.account as a", "a.id", "m.accountId")
      .leftJoin("finance.tag as t", "t.id", "m.tagId")
      .where("a.type", "!=", "credit_card")
      .where("m.removedAt", "is", null)
      .where(sql<boolean>`${!tracking.empty}`)
      .$if(tracking.start !== null, (q) =>
        q.where(sql<boolean>`m.booked_at >= ${tracking.start}::timestamptz`),
      )
      .where(
        sql<boolean>`m.booked_at < ${tracking.end}::timestamptz AND m.booked_at <= ${input.asOf}::timestamptz`,
      )
      .where(
        sql<boolean>`EXISTS (SELECT 1 FROM finance.objective_tag l WHERE l.objective_id=${input.id}::uuid AND l.tag_id=m.tag_id)`,
      );
  }

  async facts(input: SavingsRead) {
    const tracking = await this.scope(input);
    const groups = await this.movements(input, tracking)
      .select([
        "a.type as accountType",
        "m.type",
        "m.reviewStatus",
        sql<string>`sum(m.amount)::text`.as("amount"),
        sql<number>`count(*)::int`.as("count"),
      ])
      .groupBy(["a.type", "m.type", "m.reviewStatus"])
      .execute();
    const historyCoverage = await this.db
      .selectFrom("finance.account")
      .select([
        "id as accountId",
        "historyCompleteness as completeness",
        "historyFrom as from",
        "historyThrough as through",
      ])
      .where("type", "!=", "credit_card")
      .orderBy("id")
      .limit(10001)
      .execute();
    return { groups, tracking, historyCoverage };
  }

  async evidence(input: SavingsEvidenceRead) {
    const tracking = await this.scope(input);
    const { cursor, limit, ...selection } = input;
    const key = JSON.stringify(selection);
    const boundary = cursor ? decodeSelectionCursor(cursor, key) : null;
    let query = this.movements(input, tracking).select([
      "m.id",
      "m.amount",
      "m.type",
      "m.merchant",
      "m.description",
      "m.reviewStatus",
      "a.id as accountId",
      "a.type as accountType",
      budgetTimestamp(sql.ref<Date>("m.bookedAt")).as("bookedAt"),
      sql<TagSummary | null>`CASE WHEN t.id IS NULL THEN NULL ELSE jsonb_build_object('id',t.id,'name',t.name,'color',t.color) END`.as(
        "tag",
      ),
    ]);
    if (boundary)
      query = query.where(
        sql<boolean>`(m.booked_at,m.id) < (${boundary.bookedAt}::timestamptz,${boundary.id}::uuid)`,
      );
    const rows = await query
      .orderBy("m.bookedAt", "desc")
      .orderBy("m.id", "desc")
      .limit(limit + 1)
      .execute();
    return {
      ...toCursorPage(rows, limit, (row) =>
        encodeSelectionCursor(key, row.bookedAt, row.id),
      ),
      tracking,
      goalVersion: input.expectedVersion,
    };
  }
}
