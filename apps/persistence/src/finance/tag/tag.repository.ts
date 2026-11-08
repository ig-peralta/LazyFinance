import type { TagCreateInput, UpdateTag } from "@lazyfinance/contracts";
import { Inject, Injectable } from "@nestjs/common";
import { TRPCError } from "@trpc/server";
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

    const existing = await this.db
      .selectFrom("finance.tag")
      .select(["id", "name", "color", "isArchived"])
      .where("name", "=", input.name)
      .executeTakeFirstOrThrow();
    if (existing.isArchived)
      throw new TRPCError({
        code: "CONFLICT",
        message: "An archived tag reserves this name",
      });
    return existing;
  }

  private async owned(id: string) {
    const row = await this.db
      .selectFrom("finance.tag")
      .select(["id", "name", "color", "isArchived"])
      .where("id", "=", id)
      .forUpdate()
      .executeTakeFirst();
    if (!row)
      throw new TRPCError({ code: "NOT_FOUND", message: "Tag not found" });
    return row;
  }

  async update({ id, ...changes }: UpdateTag) {
    const row = await this.owned(id);
    if (row.isArchived)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Archived tags cannot be edited",
      });
    if (changes.name !== undefined && changes.name !== row.name) {
      const duplicate = await this.db
        .selectFrom("finance.tag")
        .select("id")
        .where("name", "=", changes.name)
        .executeTakeFirst();
      if (duplicate)
        throw new TRPCError({
          code: "CONFLICT",
          message: "Tag name is already reserved",
        });
    }
    if (
      (changes.name === undefined || changes.name === row.name) &&
      (changes.color === undefined || changes.color === row.color)
    )
      return row;
    return this.db
      .updateTable("finance.tag")
      .set({ ...changes, updatedAt: sql<Date>`clock_timestamp()` })
      .where("id", "=", id)
      .returning(["id", "name", "color", "isArchived"])
      .executeTakeFirstOrThrow();
  }

  async archive(id: string) {
    const row = await this.owned(id);
    if (row.isArchived) return row;
    return this.db
      .updateTable("finance.tag")
      .set({ isArchived: true, updatedAt: sql<Date>`clock_timestamp()` })
      .where("id", "=", id)
      .returning(["id", "name", "color", "isArchived"])
      .executeTakeFirstOrThrow();
  }
}
