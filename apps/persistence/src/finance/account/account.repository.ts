import type { AccountListItem, SetAccountAlias } from "@lazyfinance/contracts";
import { Inject, Injectable } from "@nestjs/common";
import { TRPCError } from "@trpc/server";
import { type Kysely, sql } from "kysely";
import { RLS_DB } from "../../database/tokens";
import type { FinanceTables } from "../finance.tables";

@Injectable()
export class AccountRepository {
  constructor(@Inject(RLS_DB) private readonly db: Kysely<FinanceTables>) {}

  private projection() {
    return this.db
      .selectFrom("finance.account as a")
      .innerJoin(
        "finance.provider_connection as c",
        "c.id",
        "a.providerConnectionId",
      )
      .innerJoin("finance.provider as p", "p.id", "c.providerId")
      .leftJoin(
        "finance.provider_account_selection as s",
        "s.connectionId",
        "c.id",
      )
      .select([
        "a.id",
        "a.alias",
        "a.type",
        "a.currency",
        "a.balance",
        "a.lastSyncedAt",
      ])
      .select(
        sql<
          AccountListItem["trackingStatus"]
        >`CASE WHEN p.identifier <> 'fintoc' THEN NULL
        WHEN c.disconnected_at IS NOT NULL OR c.status <> 'active' THEN 'disconnected'
        WHEN s.confirmed_at IS NOT NULL AND a.external_id = ANY(s.account_ids) THEN 'tracked'
        ELSE 'paused' END`.as("trackingStatus"),
      );
  }

  listActive() {
    // Deliberately no user WHERE: the database independently enforces ownership.
    return this.projection()
      .where("a.active", "=", true)
      .orderBy("a.createdAt")
      .orderBy("a.id")
      .execute();
  }

  async setAlias(input: SetAccountAlias) {
    const saved = await this.db
      .updateTable("finance.account")
      .set({ alias: input.alias, updatedAt: sql<Date>`now()` })
      .where("id", "=", input.id)
      .returning("id")
      .executeTakeFirst();
    if (!saved)
      throw new TRPCError({ code: "NOT_FOUND", message: "Account not found" });
    return this.projection()
      .where("a.id", "=", input.id)
      .executeTakeFirstOrThrow();
  }
}
