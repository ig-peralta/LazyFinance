import type { TagCreateInput } from "@lazyfinance/contracts";
import { Inject, Injectable } from "@nestjs/common";
import { type Kysely, sql } from "kysely";
import { RLS_DB } from "../../database/tokens";
import type { TagTables } from "./tag.tables";

@Injectable()
export class TagRepository {
  constructor(@Inject(RLS_DB) private readonly db: Kysely<TagTables>) {}
  list() {
    return this.db
      .selectFrom("finance.tag")
      .select(["id", "name", "color", "isArchived"])
      .orderBy("name")
      .orderBy("id")
      .limit(10001)
      .execute();
  }
  async create(input: TagCreateInput) {
    const created = await this.db
      .insertInto("finance.tag")
      .values({ ...input, userId: sql<string>`identity.current_user_id()` })
      .onConflict((oc) => oc.columns(["userId", "name"]).doNothing())
      .returning(["id", "name", "color", "isArchived"])
      .executeTakeFirst();
    if (created) return created;
    return this.db
      .selectFrom("finance.tag")
      .select(["id", "name", "color", "isArchived"])
      .where("name", "=", input.name)
      .executeTakeFirstOrThrow();
  }
}
