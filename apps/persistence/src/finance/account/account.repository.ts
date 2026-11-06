import { Inject, Injectable } from "@nestjs/common";
import type { Kysely } from "kysely";
import { RLS_DB } from "../../database/tokens";
import type { AccountTables } from "./account.tables";

@Injectable()
export class AccountRepository {
  constructor(@Inject(RLS_DB) private readonly db: Kysely<AccountTables>) {}

  listActive() {
    // Deliberately no user WHERE: the database independently enforces ownership.
    return this.db
      .selectFrom("finance.account")
      .select(["id", "alias", "type", "currency", "balance", "lastSyncedAt"])
      .where("active", "=", true)
      .orderBy("createdAt")
      .orderBy("id")
      .execute();
  }
}
