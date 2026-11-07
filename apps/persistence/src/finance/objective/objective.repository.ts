import type { ObjectiveSpendingInput } from "@lazyfinance/contracts/internal";
import { Inject, Injectable } from "@nestjs/common";
import { type Kysely, sql } from "kysely";
import { jsonArrayFrom } from "kysely/helpers/postgres";
import { RLS_DB } from "../../database/tokens";
import type { BudgetRevisionTables } from "../budget-revision/budget-revision.tables";
import type { BudgetRevisionTagTables } from "../budget-revision-tag/budget-revision-tag.tables";
import type { ObjectiveTagTables } from "../objective-tag/objective-tag.tables";
import type { TagTables } from "../tag/tag.tables";
import type { TransactionTables } from "../transaction/transaction.tables";
import { budgetInstant, budgetTimestamp } from "./budget-sql";
import type { ObjectiveTables } from "./objective.tables";

type Tables = ObjectiveTables &
  ObjectiveTagTables &
  BudgetRevisionTables &
  BudgetRevisionTagTables &
  TagTables &
  TransactionTables;

@Injectable()
export class ObjectiveRepository {
  constructor(@Inject(RLS_DB) private readonly db: Kysely<Tables>) {}

  private definitions(before?: string) {
    const at = before ? budgetInstant(before) : sql<Date>`now()`;
    return this.db
      .selectFrom("finance.objective as o")
      .leftJoinLateral(
        (eb) =>
          eb
            .selectFrom("finance.budget_revision as v")
            .selectAll("v")
            .whereRef("v.objectiveId", "=", "o.id")
            .where("v.supersededAt", "is", null)
            .$if(before !== undefined, (query) =>
              query.where("v.effectiveFrom", "<", at),
            )
            .orderBy(sql<boolean>`v.effective_from <= ${at}`, "desc")
            .orderBy(
              sql<Date>`CASE WHEN v.effective_from <= ${at} THEN v.effective_from END`,
              "desc",
            )
            .orderBy("v.effectiveFrom")
            .limit(1)
            .as("r"),
        (join) => join.onTrue(),
      )
      .where((eb) =>
        eb.or([
          eb("r.id", "is not", null),
          // Owner-only seeds/fixtures can insert legacy rows after migrations.
          // Never fall back to the mutable baseline once revisions exist.
          eb.not(
            eb.exists(
              eb
                .selectFrom("finance.budget_revision as v")
                .select("v.id")
                .whereRef("v.objectiveId", "=", "o.id"),
            ),
          ),
        ]),
      )
      .select([
        "o.id",
        "o.intent",
        sql<string>`coalesce(r.name, o.name)`.as("name"),
        sql<string>`coalesce(r.amount, o.amount)::text`.as("amount"),
        sql<"time_based" | "amount_based">`coalesce(r.kind, o.kind)`.as("kind"),
        sql<
          boolean | null
        >`CASE WHEN r.id IS NULL THEN o.is_recurring ELSE r.is_recurring END`.as(
          "isRecurring",
        ),
        sql<
          "daily" | "weekly" | "monthly" | "yearly" | null
        >`CASE WHEN r.id IS NULL THEN o.period ELSE r.period END`.as("period"),
        budgetTimestamp(
          sql<Date | null>`CASE WHEN r.id IS NULL THEN o.start_date ELSE r.start_date END`,
        ).as("startDate"),
        budgetTimestamp(
          sql<Date | null>`CASE WHEN r.id IS NULL THEN o.end_date ELSE r.end_date END`,
        ).as("endDate"),
      ])
      .select((eb) =>
        jsonArrayFrom(
          eb
            .selectFrom("finance.tag as t")
            .select(["t.id", "t.name", "t.color"])
            .where((tags) =>
              tags.or([
                tags.and([
                  tags("r.id", "is not", null),
                  tags.exists(
                    tags
                      .selectFrom("finance.budget_revision_tag as l")
                      .select("l.tagId")
                      .whereRef("l.tagId", "=", "t.id")
                      .whereRef("l.revisionId", "=", "r.id"),
                  ),
                ]),
                tags.and([
                  tags("r.id", "is", null),
                  tags.exists(
                    tags
                      .selectFrom("finance.objective_tag as l")
                      .select("l.tagId")
                      .whereRef("l.tagId", "=", "t.id")
                      .whereRef("l.objectiveId", "=", "o.id"),
                  ),
                ]),
              ]),
            )
            .orderBy("t.name")
            .orderBy("t.id")
            .limit(50001),
        ).as("tags"),
      )
      .orderBy("o.createdAt")
      .orderBy("o.id")
      .limit(10001);
  }

  list() {
    return this.definitions().where("o.archivedAt", "is", null).execute();
  }

  forPeriod(before: string) {
    return this.definitions(before)
      .where("o.intent", "=", "spending")
      .select([
        sql<string>`coalesce(r.id, o.id)`.as("revisionId"),
        budgetTimestamp(sql.ref<Date | null>("o.archivedAt")).as("archivedAt"),
      ])
      .execute();
  }

  spending({ windows, asOf }: ObjectiveSpendingInput) {
    const requested = sql<{
      id: string;
      revisionId: string;
      start: string;
      end: string;
    }>`jsonb_to_recordset(${JSON.stringify(windows.map(({ revisionId, ...window }) => ({ ...window, revision_id: revisionId })))}::jsonb)`.as<"w">(
      sql`w(id uuid, revision_id uuid, start text, "end" text)`,
    );
    const start = sql<Date>`greatest(${budgetInstant(sql.ref<string>("w.start"))},
      CASE WHEN r.id IS NULL THEN o.start_date ELSE r.start_date END, r.effective_from)`;
    const end = sql<Date>`least(${budgetInstant(sql.ref<string>("w.end"))}, o.archived_at,
      CASE WHEN r.id IS NULL THEN o.end_date ELSE r.end_date END)`;

    return this.db
      .selectFrom(requested)
      .innerJoin("finance.objective as o", "o.id", "w.id")
      .leftJoin("finance.budget_revision as r", (join) =>
        join
          .onRef("r.id", "=", "w.revisionId")
          .onRef("r.objectiveId", "=", "o.id"),
      )
      .where("o.intent", "=", "spending")
      .where((eb) =>
        eb.or([
          eb.and([
            eb("r.id", "is not", null),
            eb("r.supersededAt", "is", null),
          ]),
          eb.and([
            eb("w.revisionId", "=", eb.ref("o.id")),
            eb.not(
              eb.exists(
                eb
                  .selectFrom("finance.budget_revision as v")
                  .select("v.id")
                  .whereRef("v.objectiveId", "=", "o.id"),
              ),
            ),
          ]),
        ]),
      )
      .where(sql<boolean>`${start} < ${end}`)
      .leftJoin("finance.transaction as m", (join) =>
        join
          .on(sql<boolean>`m.booked_at >= ${start} AND m.booked_at < ${end}`)
          .on("m.type", "=", "debit")
          .on("m.isInternalMovement", "=", false)
          .on("m.reviewStatus", "=", "clear")
          .on("m.removedAt", "is", null)
          .on(
            asOf
              ? sql<boolean>`m.booked_at <= ${new Date(asOf)}`
              : sql<boolean>`true`,
          )
          .on((eb) =>
            eb.or([
              eb.and([
                eb("r.id", "is not", null),
                eb.exists(
                  eb
                    .selectFrom("finance.budget_revision_tag as l")
                    .select("l.tagId")
                    .whereRef("l.revisionId", "=", "r.id")
                    .whereRef("l.tagId", "=", "m.tagId"),
                ),
              ]),
              eb.and([
                eb("r.id", "is", null),
                eb.exists(
                  eb
                    .selectFrom("finance.objective_tag as l")
                    .select("l.tagId")
                    .whereRef("l.objectiveId", "=", "o.id")
                    .whereRef("l.tagId", "=", "m.tagId"),
                ),
              ]),
            ]),
          ),
      )
      .select([
        "o.id",
        "w.revisionId",
        sql<string>`coalesce(sum(m.amount), 0)::text`.as("amount"),
        sql<number>`count(m.id)::int`.as("count"),
        budgetTimestamp(start).as("start"),
        budgetTimestamp(end).as("end"),
        budgetTimestamp(sql.ref<Date | null>("o.archivedAt")).as("archivedAt"),
      ])
      .groupBy(["o.id", "r.id", "w.revisionId", "w.start", "w.end"])
      .orderBy("o.id")
      .execute();
  }
}
