import { BankingConnectionSchema } from "@lazyfinance/contracts";
import {
  type ClaimProviderIntent,
  type CompleteProviderIntent,
  ProviderLinkSecretSchema,
  type SaveProviderIntent,
  type UpdateProviderLink,
} from "@lazyfinance/contracts/internal";
import { Inject, Injectable } from "@nestjs/common";
import { TRPCError } from "@trpc/server";
import { type Kysely, sql } from "kysely";
import { RLS_DB } from "../../database/tokens";
import { wireValue } from "../../serialization";
import type { FinanceTables } from "../finance.tables";

function conflict(
  message = "Connection changed; reconcile before retrying",
): never {
  throw new TRPCError({ code: "CONFLICT", message });
}

// The private RPC middleware supplies the scoped transaction and serializes all
// mutations with the common per-user write lock; no provider I/O occurs here.
@Injectable()
export class ProviderLinkRepository {
  constructor(@Inject(RLS_DB) private readonly db: Kysely<FinanceTables>) {}

  private projection() {
    return this.db
      .selectFrom("finance.provider_connection as c")
      .innerJoin("finance.provider as p", "p.id", "c.providerId")
      .select([
        "c.id",
        "p.identifier as provider",
        "c.mode",
        "c.holderType",
        "c.status",
        "c.disconnectedAt",
        "c.disconnectPending",
        "c.createdAt",
        "c.updatedAt",
        sql<{
          id: string;
          name: string;
        }>`jsonb_build_object('id', c.institution_id, 'name', c.institution_name)`.as(
          "institution",
        ),
      ])
      .where("p.identifier", "=", "fintoc")
      .where("c.externalId", "is not", null);
  }

  async list() {
    const rows = await this.projection()
      .orderBy("c.createdAt")
      .orderBy("c.id")
      .limit(101)
      .execute();
    if (rows.length > 100) conflict("Connection limit exceeded");
    return rows.map((row) => BankingConnectionSchema.parse(wireValue(row)));
  }

  private async publicConnection(id: string) {
    const row = await this.projection()
      .where("c.id", "=", id)
      .executeTakeFirst();
    if (!row)
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Banking connection not found",
      });
    return BankingConnectionSchema.parse(wireValue(row));
  }

  async connection(id: string) {
    const row = await this.projection()
      .where("c.id", "=", id)
      .select([
        "c.externalId",
        "c.encryptedCredential",
        "c.credentialVersion as version",
      ])
      .executeTakeFirst();
    if (!row)
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Banking connection not found",
      });
    const { externalId, encryptedCredential, version, ...connection } = row;
    return ProviderLinkSecretSchema.parse(
      wireValue({ connection, externalId, encryptedCredential, version }),
    );
  }

  private async relink(
    id: string,
    expectedVersion: number | null,
    mode: string,
    holderType: string,
  ) {
    const current = await this.connection(id);
    if (
      current.version !== expectedVersion ||
      current.connection.disconnectedAt ||
      current.connection.mode !== mode ||
      current.connection.holderType !== holderType
    )
      conflict(
        "Relink requires the unchanged owned connection, mode and holder type",
      );
    return current;
  }

  async createIntent(input: SaveProviderIntent) {
    if (input.connectionId)
      await this.relink(
        input.connectionId,
        input.expectedVersion,
        input.mode,
        input.holderType,
      );
    const pending = await this.db
      .selectFrom("finance.provider_link_intent")
      .select(sql<number>`count(*)::int`.as("count"))
      .where("state", "in", ["pending", "processing"])
      .where("expiresAt", ">", sql<Date>`now()`)
      .executeTakeFirstOrThrow();
    if (pending.count >= 10)
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "Too many pending bank connections",
      });
    return this.db
      .insertInto("finance.provider_link_intent")
      .values({
        ...input,
        userId: sql<string>`identity.current_user_id()`,
      })
      .returning("expiresAt")
      .executeTakeFirstOrThrow();
  }

  private async intent(id: string) {
    const row = await this.db
      .selectFrom("finance.provider_link_intent")
      .selectAll()
      .select(sql<boolean>`expires_at > now()`.as("unexpired"))
      .where("id", "=", id)
      .executeTakeFirst();
    if (!row)
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Banking link intent not found",
      });
    return row;
  }

  async claim(input: ClaimProviderIntent) {
    const intent = await this.intent(input.id);
    if (intent.providerIntentId !== input.providerIntentId)
      conflict("Callback does not belong to this link intent");
    if (
      intent.state === "completed" &&
      intent.exchangeTokenHash === input.exchangeTokenHash &&
      intent.completedConnectionId
    )
      return {
        state: "completed" as const,
        connection: await this.publicConnection(intent.completedConnectionId),
      };
    if (intent.state !== "pending" || !intent.unexpired)
      conflict(
        "Link intent is expired, already processing or uncertain; check connections or start again",
      );
    if (intent.connectionId)
      await this.relink(
        intent.connectionId,
        intent.expectedVersion,
        intent.mode,
        intent.holderType,
      );
    await this.db
      .updateTable("finance.provider_link_intent")
      .set({ state: "processing", exchangeTokenHash: input.exchangeTokenHash })
      .where("id", "=", input.id)
      .execute();
    return {
      state: "claimed" as const,
      mode: intent.mode,
      holderType: intent.holderType,
    };
  }

  async complete(input: CompleteProviderIntent) {
    const intent = await this.intent(input.id);
    if (intent.exchangeTokenHash !== input.exchangeTokenHash)
      conflict("Callback does not match the accepted attempt");
    if (intent.state === "completed" && intent.completedConnectionId)
      return this.publicConnection(intent.completedConnectionId);
    if (intent.state !== "processing" || !intent.unexpired)
      conflict("Link intent is no longer completable");
    const provider = await this.db
      .selectFrom("finance.provider")
      .select("id")
      .where("identifier", "=", "fintoc")
      .executeTakeFirstOrThrow();
    const fields = {
      encryptedCredential: input.encryptedCredential,
      institutionId: input.institution.id,
      institutionName: input.institution.name,
      status: input.status,
      updatedAt: sql<Date>`now()`,
    };
    let connectionId: string;
    if (intent.connectionId) {
      const previous = await this.relink(
        intent.connectionId,
        intent.expectedVersion,
        intent.mode,
        intent.holderType,
      );
      if (previous.externalId !== input.externalId)
        conflict(
          "Relink returned a different bank identity; create a separate connection",
        );
      connectionId = intent.connectionId;
      await this.db
        .updateTable("finance.provider_connection")
        .set({ ...fields, credentialVersion: previous.version + 1 })
        .where("id", "=", connectionId)
        .execute();
      await this.invalidateSync(connectionId);
    } else {
      const owned = await this.db
        .selectFrom("finance.provider_connection")
        .select("id")
        .where("providerId", "=", provider.id)
        .where("mode", "=", intent.mode)
        .where("externalId", "=", input.externalId)
        .executeTakeFirst();
      if (owned)
        conflict(
          "This bank is already connected; reconnect the existing connection",
        );
      const count = await this.db
        .selectFrom("finance.provider_connection")
        .select(sql<number>`count(*)::int`.as("count"))
        .executeTakeFirstOrThrow();
      if (count.count >= 100) conflict("Connection limit exceeded");
      // The global unique provider/mode/external ID constraint also rejects a
      // hidden foreign owner's row. Never upsert or reassign that identity.
      const saved = await this.db
        .insertInto("finance.provider_connection")
        .values({
          ...fields,
          userId: sql<string>`identity.current_user_id()`,
          providerId: provider.id,
          mode: intent.mode,
          holderType: intent.holderType,
          externalId: input.externalId,
        })
        .returning("id")
        .executeTakeFirstOrThrow();
      connectionId = saved.id;
    }
    await this.db
      .updateTable("finance.provider_link_intent")
      .set({ state: "completed", completedConnectionId: connectionId })
      .where("id", "=", input.id)
      .execute();
    return this.publicConnection(connectionId);
  }

  async fail(input: { id: string; exchangeTokenHash: string }) {
    await this.intent(input.id);
    // A lost commit response must never overwrite an actually completed attempt.
    await this.db
      .updateTable("finance.provider_link_intent")
      .set({ state: "failed" })
      .where("id", "=", input.id)
      .where("state", "=", "processing")
      .where("exchangeTokenHash", "=", input.exchangeTokenHash)
      .execute();
    return { state: (await this.intent(input.id)).state };
  }

  async status(input: UpdateProviderLink) {
    const current = await this.connection(input.id);
    if (
      current.version !== input.expectedVersion ||
      current.connection.disconnectedAt
    )
      conflict();
    if (current.connection.status !== input.status) {
      await this.db
        .updateTable("finance.provider_connection")
        .set({
          status: input.status,
          credentialVersion: current.version + 1,
          updatedAt: sql<Date>`now()`,
        })
        .where("id", "=", input.id)
        .execute();
      await this.invalidateSync(input.id);
    }
    return this.publicConnection(input.id);
  }

  async beginDisconnect(id: string) {
    const current = await this.connection(id);
    if (!current.connection.disconnectedAt) {
      await this.db
        .updateTable("finance.provider_connection")
        .set({
          status: "revoked",
          disconnectedAt: sql<Date>`now()`,
          disconnectPending: true,
          credentialVersion: current.version + 1,
          updatedAt: sql<Date>`now()`,
        })
        .where("id", "=", id)
        .execute();
      await this.invalidateSync(id);
    }
    return this.connection(id);
  }

  async finishDisconnect(input: { id: string; expectedVersion: number }) {
    const current = await this.connection(input.id);
    if (
      current.version !== input.expectedVersion ||
      !current.connection.disconnectedAt
    )
      conflict();
    await this.db
      .updateTable("finance.provider_connection")
      .set({
        disconnectPending: false,
        encryptedCredential: null,
        updatedAt: sql<Date>`now()`,
      })
      .where("id", "=", input.id)
      .execute();
    return this.publicConnection(input.id);
  }

  private async invalidateSync(id: string) {
    await this.db
      .updateTable("finance.provider_sync_state")
      .set({ revision: sql<number>`revision + 1`, leaseExpiresAt: null })
      .where("providerConnectionId", "=", id)
      .execute();
  }
}
