import type { ObjectiveSpendingInput } from "@lazyfinance/contracts/internal";
import { Inject, Injectable } from "@nestjs/common";
import { type Kysely, sql } from "kysely";
import { jsonArrayFrom } from "kysely/helpers/postgres";
import { RLS_DB } from "../../database/tokens";
import type { ObjectiveTagTables } from "../objective-tag/objective-tag.tables";
import { movementPeriod } from "../query-period";
import type { TagTables } from "../tag/tag.tables";
import type { TransactionTables } from "../transaction/transaction.tables";
import type { ObjectiveTables } from "./objective.tables";

@Injectable()
export class ObjectiveRepository {
  constructor(
    @Inject(RLS_DB)
    private readonly db: Kysely<
      ObjectiveTables & ObjectiveTagTables & TagTables & TransactionTables
    >,
  ) {}

  list() {
    return this.db
      .selectFrom("finance.objective as o")
      .select([
        "o.id",
        "o.name",
        "o.amount",
        "o.kind",
        "o.intent",
        "o.isRecurring",
        "o.period",
        "o.startDate",
        "o.endDate",
      ])
      .select((eb) =>
        jsonArrayFrom(
          eb
            .selectFrom("finance.objective_tag as l")
            .innerJoin("finance.tag as t", "t.id", "l.tagId")
            .select(["t.id", "t.name", "t.color"])
            .whereRef("l.objectiveId", "=", "o.id")
            .orderBy("t.name")
            .orderBy("t.id")
            .limit(50001),
        ).as("tags"),
      )
      .orderBy("o.createdAt")
      .orderBy("o.id")
      .limit(10001)
      .execute();
  }

  spending({ windows, asOf }: ObjectiveSpendingInput) {
    const requested = sql<{ id: string; start: string; end: string }>`
      jsonb_to_recordset(${JSON.stringify(windows)}::jsonb)
    `.as<"w">(sql`w(id uuid, start text, "end" text)`);
    return this.db
      .selectFrom(requested)
      .innerJoin("finance.objective as o", "o.id", "w.id")
      .leftJoin("finance.objective_tag as l", "l.objectiveId", "o.id")
      .leftJoin("finance.transaction as m", (join) =>
        join
          .onRef("m.tagId", "=", "l.tagId")
          .on(
            movementPeriod({
              start: sql.ref("w.start"),
              end: sql.ref("w.end"),
              asOf,
            }),
          )
          .on("m.type", "=", "debit")
          .on("m.isInternalMovement", "=", false)
          .on("m.reviewStatus", "=", "clear")
          .on("m.removedAt", "is", null),
      )
      .select([
        "o.id",
        sql<string>`coalesce(sum(m.amount), 0)::text`.as("amount"),
        sql<number>`count(m.id)::int`.as("count"),
      ])
      .groupBy("o.id")
      .orderBy("o.id")
      .execute();
  }
}
