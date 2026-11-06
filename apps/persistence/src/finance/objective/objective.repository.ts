import { Inject, Injectable } from "@nestjs/common";
import type { Kysely } from "kysely";
import { RLS_DB } from "../../database/tokens";
import type { ObjectiveTagTables } from "../objective-tag/objective-tag.tables";
import type { TagTables } from "../tag/tag.tables";
import type { ObjectiveTables } from "./objective.tables";

@Injectable()
export class ObjectiveRepository {
  constructor(
    @Inject(RLS_DB)
    private readonly db: Kysely<
      ObjectiveTables & ObjectiveTagTables & TagTables
    >,
  ) {}
  list() {
    return this.db
      .selectFrom("finance.objective")
      .select([
        "id",
        "name",
        "amount",
        "kind",
        "intent",
        "isRecurring",
        "period",
        "startDate",
        "endDate",
      ])
      .orderBy("createdAt")
      .orderBy("id")
      .limit(10001)
      .execute();
  }
  async tags(ids: string[]) {
    if (!ids.length) return [];
    return this.db
      .selectFrom("finance.objective_tag as l")
      .innerJoin("finance.tag as t", "t.id", "l.tagId")
      .select(["l.objectiveId", "t.id", "t.name", "t.color"])
      .where("l.objectiveId", "in", ids)
      .orderBy("t.name")
      .orderBy("t.id")
      .limit(50001)
      .execute();
  }
}
