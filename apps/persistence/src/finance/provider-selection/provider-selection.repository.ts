import {
  BankingSelectionSchema,
  type SelectBankingAccounts,
} from "@lazyfinance/contracts";
import type {
  DeferProviderDiscovery,
  SaveProviderDiscovery,
} from "@lazyfinance/contracts/internal";
import { Inject, Injectable } from "@nestjs/common";
import { TRPCError } from "@trpc/server";
import { type Kysely, sql } from "kysely";
import { RLS_DB } from "../../database/tokens";
import { wireValue } from "../../serialization";
import type { FinanceTables } from "../finance.tables";
import { ProviderScheduleRepository } from "../provider-scheduling/provider-schedule.repository";

@Injectable()
export class ProviderSelectionRepository {
  constructor(
    @Inject(RLS_DB) private readonly db: Kysely<FinanceTables>,
    private readonly schedules: ProviderScheduleRepository,
  ) {}

  private async connection(id: string) {
    const connection = await this.db
      .selectFrom("finance.provider_connection as c")
      .innerJoin("finance.provider as p", "p.id", "c.providerId")
      .select([
        "c.id",
        "c.credentialVersion",
        "c.status",
        "c.disconnectedAt",
        "c.mode",
      ])
      .where("c.id", "=", id)
      .where("p.identifier", "=", "fintoc")
      .executeTakeFirst();
    if (!connection)
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Banking connection not found",
      });
    return connection;
  }

  async get(id: string) {
    await this.connection(id);
    const row = await this.db
      .selectFrom("finance.provider_account_selection")
      .selectAll()
      .where("connectionId", "=", id)
      .executeTakeFirst();
    return BankingSelectionSchema.parse(
      wireValue(
        row ?? {
          connectionId: id,
          version: 0,
          discoveryVersion: 0,
          discoveredAt: null,
          readRetryAfter: null,
          accounts: [],
          accountIds: [],
          confirmedAt: null,
          automaticEnrolled: false,
        },
      ),
    );
  }

  async tracking(id: string) {
    const selection = await this.get(id);
    return {
      selection,
      automation: await this.schedules.status(id, selection),
    };
  }

  async discover(input: SaveProviderDiscovery) {
    const connection = await this.connection(input.connectionId);
    if (
      connection.credentialVersion !== input.expectedCredentialVersion ||
      connection.disconnectedAt ||
      connection.status !== "active"
    )
      throw new TRPCError({
        code: "CONFLICT",
        message: "Bank connection changed during discovery",
      });
    const accounts = JSON.stringify(input.accounts);
    await this.db
      .insertInto("finance.provider_account_selection")
      .values({
        connectionId: input.connectionId,
        userId: sql<string>`identity.current_user_id()`,
        discoveryVersion: 1,
        discoveredAt: sql<Date>`now()`,
        credentialVersion: input.expectedCredentialVersion,
        accounts,
      })
      .onConflict((oc) =>
        oc.column("connectionId").doUpdateSet({
          discoveryVersion: sql<number>`finance.provider_account_selection.discovery_version + 1`,
          discoveredAt: sql<Date>`now()`,
          credentialVersion: input.expectedCredentialVersion,
          accounts,
        }),
      )
      .execute();
    return this.get(input.connectionId);
  }

  async deferDiscovery(input: DeferProviderDiscovery) {
    const connection = await this.connection(input.connectionId);
    if (
      connection.credentialVersion !== input.expectedCredentialVersion ||
      connection.disconnectedAt
    )
      throw new TRPCError({
        code: "CONFLICT",
        message: "Bank connection changed during discovery",
      });
    const retryAfter = new Date(input.retryAfter);
    if (retryAfter.getTime() <= Date.now()) return this.get(input.connectionId);
    await this.db
      .insertInto("finance.provider_account_selection")
      .values({
        connectionId: input.connectionId,
        userId: sql<string>`identity.current_user_id()`,
        accounts: "[]",
        readRetryAfter: retryAfter,
      })
      .onConflict((oc) =>
        oc.column("connectionId").doUpdateSet({
          readRetryAfter: sql<Date>`greatest(finance.provider_account_selection.read_retry_after, ${retryAfter})`,
        }),
      )
      .execute();
    await this.schedules.deferRead(input.connectionId, retryAfter);
    return this.get(input.connectionId);
  }

  async select(input: SelectBankingAccounts) {
    const connection = await this.connection(input.id);
    const current = await this.db
      .selectFrom("finance.provider_account_selection")
      .selectAll()
      .where("connectionId", "=", input.id)
      .executeTakeFirst();
    if (
      !current ||
      current.version !== input.expectedVersion ||
      current.discoveryVersion !== input.discoveryVersion ||
      current.credentialVersion !== connection.credentialVersion ||
      connection.disconnectedAt ||
      connection.status !== "active"
    )
      throw new TRPCError({
        code: "CONFLICT",
        message:
          "Discover the current owned accounts before confirming selection",
      });
    const available = new Set(
      current.accounts
        .filter((account) => account.unavailableReason === null)
        .map((account) => account.externalId),
    );
    if (input.accountIds.some((id) => !available.has(id)))
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Selection contains an unavailable account",
      });
    const ids = [...input.accountIds].sort();
    if (
      current.confirmedAt &&
      JSON.stringify([...current.accountIds].sort()) === JSON.stringify(ids) &&
      current.automaticEnrolled === input.automaticEnrolled
    )
      return this.get(input.id);
    await this.db
      .updateTable("finance.provider_account_selection")
      .set({
        accountIds: ids,
        automaticEnrolled: input.automaticEnrolled,
        version: current.version + 1,
        confirmedAt: sql<Date>`now()`,
      })
      .where("connectionId", "=", input.id)
      .execute();
    await this.db
      .updateTable("finance.provider_sync_state")
      .set({ revision: sql<number>`revision + 1`, leaseExpiresAt: null })
      .where("providerConnectionId", "=", input.id)
      .execute();
    await this.schedules.refreshConnection(input.id);
    return this.get(input.id);
  }
}
