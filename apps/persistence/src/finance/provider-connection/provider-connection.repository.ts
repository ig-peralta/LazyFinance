import {
  type BeginProviderSync,
  type CommitProviderSync,
  ProviderAccountRecordSchema,
  ProviderSyncFactsSchema,
  type ProviderSyncScope,
  type RecordProviderFailure,
} from "@lazyfinance/contracts/internal";
import { Inject, Injectable } from "@nestjs/common";
import { TRPCError } from "@trpc/server";
import { type Kysely, sql } from "kysely";
import { fingerprint } from "../../database/fingerprint";
import { RLS_DB } from "../../database/tokens";
import { wireValue } from "../../serialization";
import type { FinanceTables } from "../finance.tables";
import type { ProviderMovementConflictTable } from "../provider-movement-conflict/provider-movement-conflict.tables";
import { TagRuleRepository } from "../tag-rule/tag-rule.repository";
import {
  applyProviderSuspensions,
  resolveProviderSuspension,
} from "./provider-suspension";

const keyOf = (account: string, movement: string) =>
  JSON.stringify([account, movement]);

function invalid(message: string): never {
  throw new TRPCError({ code: "BAD_REQUEST", message });
}

const date = (value: string | null) =>
  value === null ? null : new Date(value);

@Injectable()
export class ProviderConnectionRepository {
  constructor(
    @Inject(RLS_DB) private readonly db: Kysely<FinanceTables>,
    private readonly tagging: TagRuleRepository,
  ) {}

  private async connection(id: string) {
    const row = await this.db
      .selectFrom("finance.provider_connection as c")
      .innerJoin("finance.provider as p", "p.id", "c.providerId")
      .select([
        "c.id",
        "c.status",
        "c.credentialVersion",
        "c.disconnectedAt",
        "c.disconnectPending",
        "p.identifier",
      ])
      .select(
        sql<boolean>`${sql.ref("c.encryptedCredential")} is not null`.as(
          "hasCredential",
        ),
      )
      .where("c.id", "=", id)
      .executeTakeFirst();
    if (!row)
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Banking connection not found",
      });

    return row;
  }

  private async state(id: string) {
    return this.db
      .selectFrom("finance.provider_sync_state")
      .selectAll()
      .where("providerConnectionId", "=", id)
      .executeTakeFirstOrThrow();
  }

  async begin({
    connectionId,
    provider,
    expectedCredentialVersion,
  }: BeginProviderSync) {
    const connection = await this.connection(connectionId);

    if (connection.identifier !== provider)
      invalid("Connector does not match this connection");

    if (
      expectedCredentialVersion !== undefined &&
      connection.credentialVersion !== expectedCredentialVersion
    )
      throw new TRPCError({
        code: "CONFLICT",
        message: "Bank credentials changed before sync",
      });

    if (
      provider === "fintoc" &&
      (expectedCredentialVersion === undefined ||
        !connection.hasCredential ||
        connection.disconnectedAt)
    )
      invalid("An active owned credential snapshot is required");

    if (connection.status !== "active")
      invalid("Banking connection needs relinking");

    const current = await this.db
      .selectFrom("finance.provider_sync_state")
      .selectAll()
      .where("providerConnectionId", "=", connectionId)
      .executeTakeFirst();
    const now = Date.now();
    if (
      current &&
      ((current.leaseExpiresAt && current.leaseExpiresAt.getTime() > now) ||
        (current.retryAfter && current.retryAfter.getTime() > now))
    )
      return { ...current, acquired: false };

    const leaseExpiresAt = new Date(now + 5 * 60_000);
    const state = await this.db
      .insertInto("finance.provider_sync_state")
      .values({
        providerConnectionId: connectionId,
        lastAttemptAt: sql<Date>`now()`,
        leaseExpiresAt,
      })
      .onConflict((oc) =>
        oc.column("providerConnectionId").doUpdateSet({
          lastAttemptAt: sql<Date>`now()`,
          leaseExpiresAt,
          revision: sql<number>`finance.provider_sync_state.revision + 1`,
        }),
      )
      .returningAll()
      .executeTakeFirstOrThrow();
    return { ...state, acquired: true };
  }

  async status(id: string) {
    const connection = await this.connection(id);
    const state = await this.db
      .selectFrom("finance.provider_sync_state")
      .selectAll()
      .where("providerConnectionId", "=", id)
      .executeTakeFirst();
    const accounts = await this.db
      .selectFrom("finance.account as a")
      .select([
        "a.id",
        "a.type",
        "a.lastSyncedAt",
        "a.historyCompleteness",
        "a.historyFrom",
        "a.historyThrough",
      ])
      .select(
        sql<boolean>`${sql.ref("a.balance")} is not null`.as(
          "hasReportedBalance",
        ),
      )
      .where("a.providerConnectionId", "=", id)
      .where("a.active", "=", true)
      .orderBy("a.id")
      .limit(1001)
      .execute();
    const pending = await this.db
      .selectFrom("finance.provider_movement_conflict as c")
      .innerJoin("finance.transaction as m", "m.id", "c.transactionId")
      .innerJoin("finance.account as a", "a.id", "m.accountId")
      .select(sql<number>`count(*)::int`.as("count"))
      .where("a.providerConnectionId", "=", id)
      .where("c.reason", "=", "provider_unbooked")
      .where("c.resolvedAt", "is", null)
      .executeTakeFirstOrThrow();
    return {
      connection: {
        id,
        status: connection.status,
        disconnectedAt: connection.disconnectedAt,
        disconnectPending: connection.disconnectPending,
      },
      state: state ?? null,
      providerSuspensionCount: pending.count,
      accounts,
    };
  }

  async facts(scope: ProviderSyncScope) {
    const connection = await this.connection(scope.connectionId);
    const state = await this.state(scope.connectionId);
    if (state.revision !== scope.revision || connection.status !== "active") {
      throw new TRPCError({ code: "CONFLICT", message: "Sync was superseded" });
    }

    const keys = JSON.stringify(scope.keys);
    const accounts = await this.db
      .selectFrom("finance.account")
      .selectAll()
      .where("providerConnectionId", "=", scope.connectionId)
      .orderBy("id")
      .limit(50001)
      .execute();
    const movements = await this.db
      .selectFrom("finance.transaction as m")
      .innerJoin("finance.account as a", "a.id", "m.accountId")
      .leftJoin("finance.income_receipt as r", "r.transactionId", "m.id")
      .selectAll("m")
      .select([
        "a.externalId as accountExternalId",
        sql<boolean>`r.transaction_id IS NOT NULL`.as("hasReceipt"),
        sql<boolean>`m.user_internal_override IS FALSE AND EXISTS (SELECT 1 FROM finance.provider_movement_conflict c
          WHERE c.transaction_id=m.id AND c.reason='internal_override_disagrees' AND c.resolved_at IS NOT NULL
          AND c.incoming_facts->>'providerInternalAssessment'=m.provider_internal_assessment::text)`.as(
          "internalOverrideAcknowledged",
        ),
        sql<boolean>`EXISTS (SELECT 1 FROM finance.provider_movement_conflict c WHERE c.transaction_id=m.id
          AND c.reason='provider_unbooked' AND c.resolved_at IS NULL)`.as(
          "providerSuspended",
        ),
        sql<boolean>`EXISTS (SELECT 1 FROM finance.provider_movement_conflict c WHERE c.transaction_id=m.id
          AND c.reason!='provider_unbooked' AND c.resolved_at IS NULL)`.as(
          "hasOtherConflicts",
        ),
      ])
      .where("a.providerConnectionId", "=", scope.connectionId)
      .where(sql<boolean>`EXISTS (SELECT 1 FROM jsonb_to_recordset(${keys}::jsonb) AS k("accountExternalId" text, "externalId" text)
        WHERE k."accountExternalId" = a.external_id AND k."externalId" = m.external_id)`)
      .orderBy("m.id")
      .limit(100001)
      .execute();
    const removals = await this.db
      .selectFrom("finance.provider_movement_removal as r")
      .selectAll()
      .where("r.providerConnectionId", "=", scope.connectionId)
      .where(sql<boolean>`EXISTS (SELECT 1 FROM jsonb_to_recordset(${keys}::jsonb) AS k("accountExternalId" text, "externalId" text)
        WHERE k."accountExternalId" = r.account_external_id AND k."externalId" = r.movement_external_id)`)
      .orderBy("r.accountExternalId")
      .orderBy("r.movementExternalId")
      .limit(100001)
      .execute();
    const rules = await this.tagging.matchingRules();
    // Hash the same schema-normalized representation sent to the API, not pg rows.
    const facts = ProviderSyncFactsSchema.omit({ fingerprint: true }).parse(
      wireValue({
        state,
        accounts,
        movements,
        removals,
        rules,
      }),
    );

    return { ...facts, fingerprint: fingerprint(facts) };
  }

  async commit(input: CommitProviderSync) {
    const { scope } = input;
    const connection = await this.connection(scope.connectionId);
    const state = await this.state(scope.connectionId);
    if (
      connection.status !== "active" ||
      state.revision !== scope.revision ||
      !state.leaseExpiresAt ||
      state.leaseExpiresAt.getTime() <= Date.now()
    )
      return { status: "superseded" as const };

    const facts = await this.facts(scope);
    if (facts.fingerprint !== input.expectedFingerprint)
      throw new TRPCError({
        code: "CONFLICT",
        message: "Sync inputs changed; prepare again",
      });

    if (
      state.lastProviderObservedAt &&
      new Date(input.observedAt) < state.lastProviderObservedAt
    )
      invalid("Provider returned an older snapshot");

    const accounts = new Map(
      facts.accounts
        .filter((row) => row.externalId !== null)
        .map((row) => [row.externalId!, row]),
    );
    const movements = new Map(
      facts.movements.map((row) => [
        keyOf(row.accountExternalId, row.externalId),
        row,
      ]),
    );
    const tombstones = new Map(
      facts.removals.map((row) => [
        keyOf(row.accountExternalId, row.movementExternalId),
        row,
      ]),
    );
    const keys = new Set(
      scope.keys.map((row) => keyOf(row.accountExternalId, row.externalId)),
    );
    const removed = new Set(
      input.removals.map((row) => keyOf(row.accountExternalId, row.externalId)),
    );
    const rules = new Map(facts.rules.map((rule) => [rule.id, rule]));

    for (const prepared of input.accounts) {
      const existing = accounts.get(prepared.externalId);

      if (existing && existing.id !== prepared.id)
        invalid("Account identity changed");

      if (
        existing &&
        (existing.type === "credit_card") !== (prepared.type === "credit_card")
      )
        invalid("Account balance meaning changed");

      if (
        new Date(prepared.providerObservedAt) > new Date(input.observedAt) ||
        (existing?.providerObservedAt &&
          new Date(prepared.providerObservedAt) <
            new Date(existing.providerObservedAt))
      )
        invalid("Stale account snapshot");

      if (
        existing?.lastSyncedAt &&
        prepared.lastSyncedAt &&
        new Date(prepared.lastSyncedAt) < new Date(existing.lastSyncedAt)
      )
        invalid("Stale reported balance");

      if (
        existing &&
        prepared.historyCompleteness === "unknown" &&
        existing.historyCompleteness !== "unknown"
      )
        invalid("Known account history cannot be discarded");

      const { id, externalId, providerObservedAt, lastSyncedAt, ...rest } =
        prepared;
      const fields = {
        ...rest,
        providerObservedAt: new Date(providerObservedAt),
        lastSyncedAt: date(lastSyncedAt),
        updatedAt: sql<Date>`now()`,
      };
      const saved = existing
        ? await this.db
            .updateTable("finance.account")
            .set(fields)
            .where("id", "=", id)
            .returningAll()
            .executeTakeFirstOrThrow()
        : await this.db
            .insertInto("finance.account")
            .values({
              ...fields,
              id,
              externalId,
              providerConnectionId: scope.connectionId,
              userId: sql<string>`identity.current_user_id()`,
            })
            .returningAll()
            .executeTakeFirstOrThrow();
      accounts.set(
        externalId,
        ProviderAccountRecordSchema.parse(wireValue(saved)),
      );
    }

    for (const prepared of input.movements) {
      const key = keyOf(prepared.accountExternalId, prepared.externalId);

      if (!keys.has(key)) invalid("Movement is outside the prepared scope");

      if (removed.has(key) || tombstones.has(key)) continue; // No implicit resurrection.

      const owner = accounts.get(prepared.accountExternalId);

      if (!owner) invalid("Movement references an unknown account");

      const previous = movements.get(key);

      if (
        previous &&
        (previous.id !== prepared.id || previous.source !== "provider")
      )
        invalid("Provider identity collides with an existing movement");

      if (previous?.removedAt) continue;

      if (
        new Date(prepared.providerObservedAt) > new Date(input.observedAt) ||
        (previous?.providerObservedAt &&
          new Date(prepared.providerObservedAt) <
            new Date(previous.providerObservedAt)) ||
        (previous?.providerUpdatedAt &&
          prepared.providerUpdatedAt &&
          new Date(prepared.providerUpdatedAt) <
            new Date(previous.providerUpdatedAt))
      )
        invalid("Stale movement snapshot");

      const effective =
        previous?.userInternalOverride ??
        (prepared.providerInternalAssessment === "unknown"
          ? null
          : prepared.providerInternalAssessment === "internal");
      const reasons: ProviderMovementConflictTable["reason"][] = [];

      if (
        previous?.userInternalOverride === false &&
        !previous.internalOverrideAcknowledged &&
        prepared.providerInternalAssessment === "internal"
      )
        reasons.push("internal_override_disagrees");

      if (
        previous?.hasReceipt &&
        (prepared.type !== "credit" ||
          (effective !== false && previous.userInternalOverride !== true))
      )
        reasons.push("receipt_incompatible");

      const {
        accountExternalId: _,
        decision,
        id,
        externalId,
        ...rest
      } = prepared;
      const fields = {
        ...rest,
        bookedAt: new Date(rest.bookedAt),
        providerObservedAt: new Date(rest.providerObservedAt),
        providerUpdatedAt: date(rest.providerUpdatedAt),
        isInternalMovement: effective,
        reviewStatus:
          (previous?.reviewStatus === "needs_review" &&
            (!previous.providerSuspended || previous.hasOtherConflicts)) ||
          reasons.length
            ? ("needs_review" as const)
            : ("clear" as const),
      };
      if (previous?.providerSuspended)
        await resolveProviderSuspension(this.db, id);
      const saved = previous
        ? await this.db
            .updateTable("finance.transaction")
            .set(fields)
            .where("id", "=", id)
            .returningAll()
            .executeTakeFirstOrThrow()
        : await this.db
            .insertInto("finance.transaction")
            .values({
              ...fields,
              id,
              externalId,
              accountId: owner.id,
              source: "provider",
            })
            .returningAll()
            .executeTakeFirstOrThrow();

      for (const reason of reasons)
        await this.conflict(
          id,
          reason,
          {
            amount: previous?.amount,
            type: previous?.type,
            bookedAt: previous?.bookedAt,
            isInternalMovement: previous?.isInternalMovement,
          },
          {
            amount: prepared.amount,
            type: prepared.type,
            bookedAt: prepared.bookedAt,
            bookedPrecision: prepared.bookedPrecision,
            bookedOn: prepared.bookedOn,
            providerInternalAssessment: prepared.providerInternalAssessment,
          },
          prepared.providerObservedAt,
        );

      if (decision) await this.tagging.applyPrepared(saved, decision, rules);
    }

    await applyProviderSuspensions(
      this.db,
      input,
      new Set(accounts.keys()),
      movements,
      new Set(tombstones.keys()),
      keys,
    );

    for (const removal of input.removals) {
      const key = keyOf(removal.accountExternalId, removal.externalId);

      if (
        !keys.has(key) ||
        new Date(removal.observedAt) > new Date(input.observedAt)
      )
        invalid("Removal is outside the prepared scope");

      const tombstone = tombstones.get(key);
      await this.db
        .insertInto("finance.provider_movement_removal")
        .values({
          providerConnectionId: scope.connectionId,
          accountExternalId: removal.accountExternalId,
          movementExternalId: removal.externalId,
          reason: removal.reason,
          observedAt: new Date(removal.observedAt),
          providerUpdatedAt: date(removal.providerUpdatedAt),
        })
        .onConflict((oc) =>
          oc
            .columns([
              "providerConnectionId",
              "accountExternalId",
              "movementExternalId",
            ])
            .doNothing(),
        )
        .execute();
      const previous = movements.get(key);

      if (!previous || previous.removedAt) continue;

      if (previous.source !== "provider")
        invalid("Provider removal targets a manual movement");

      if (previous.providerSuspended)
        await resolveProviderSuspension(this.db, previous.id);

      await this.db
        .updateTable("finance.transaction")
        .set({
          removedAt: new Date(tombstone?.observedAt ?? removal.observedAt),
          removalReason: removal.reason,
          reviewStatus:
            previous.hasReceipt ||
            (previous.reviewStatus === "needs_review" &&
              (!previous.providerSuspended || previous.hasOtherConflicts))
              ? "needs_review"
              : "clear",
        })
        .where("id", "=", previous.id)
        .execute();

      if (previous.hasReceipt)
        await this.conflict(
          previous.id,
          "removed_confirmed_income",
          { amount: previous.amount, type: previous.type },
          { removalReason: removal.reason },
          removal.observedAt,
        );
    }

    const count = await this.db
      .selectFrom("finance.provider_movement_conflict as c")
      .innerJoin("finance.transaction as m", "m.id", "c.transactionId")
      .innerJoin("finance.account as a", "a.id", "m.accountId")
      .select(sql<number>`count(*)::int`.as("count"))
      .where("a.providerConnectionId", "=", scope.connectionId)
      .where("c.resolvedAt", "is", null)
      .executeTakeFirstOrThrow();
    const status = count.count
      ? ("needs_review" as const)
      : ("complete" as const);
    await this.db
      .updateTable("finance.provider_sync_state")
      .set({
        checkpoint: input.checkpoint,
        revision: scope.revision + 1,
        lastSuccessAt: sql<Date>`now()`,
        lastProviderObservedAt: new Date(input.observedAt),
        lastResult: status,
        unresolvedConflictCount: count.count,
        lastFailureReason: null,
        retryAfter: null,
        leaseExpiresAt: null,
      })
      .where("providerConnectionId", "=", scope.connectionId)
      .execute();

    return { status, conflictCount: count.count, checkpoint: input.checkpoint };
  }

  async failure(input: RecordProviderFailure) {
    const connection = await this.connection(input.connectionId);
    const state = await this.state(input.connectionId);
    if (connection.status !== "active" || state.revision !== input.revision)
      return { status: "superseded" as const };

    await this.db
      .updateTable("finance.provider_sync_state")
      .set({
        lastFailureAt: new Date(input.observedAt),
        lastFailureReason: input.reason,
        retryAfter: date(input.retryAfter),
        leaseExpiresAt: null,
        revision: input.revision + 1,
      })
      .where("providerConnectionId", "=", input.connectionId)
      .execute();

    if (input.reason === "revoked" || input.reason === "expired")
      await this.db
        .updateTable("finance.provider_connection")
        .set({
          status: input.reason,
          credentialVersion: sql<number>`credential_version + 1`,
          updatedAt: sql<Date>`now()`,
        })
        .where("id", "=", input.connectionId)
        .execute();

    return {
      status: "failed" as const,
      reason: input.reason,
      retryAfter: input.retryAfter,
    };
  }

  review() {
    return this.db
      .selectFrom("finance.provider_movement_conflict as c")
      .innerJoin("finance.transaction as m", "m.id", "c.transactionId")
      .innerJoin("finance.account as a", "a.id", "m.accountId")
      .leftJoin("finance.income_receipt as r", "r.transactionId", "m.id")
      .select([
        "m.id as transactionId",
        "a.id as accountId",
        "c.reason",
        "m.amount",
        "m.type",
        "m.bookedAt",
        "m.tagId",
        "r.sourceId as incomeSourceId",
        "c.previousFacts",
        "c.incomingFacts",
      ])
      .where("c.resolvedAt", "is", null)
      .orderBy("c.observedAt")
      .orderBy("m.id")
      .orderBy("c.reason")
      .limit(50001)
      .execute();
  }

  private conflict(
    transactionId: string,
    reason: ProviderMovementConflictTable["reason"],
    previousFacts: Record<string, unknown>,
    incomingFacts: Record<string, unknown>,
    observedAt: string,
  ) {
    return this.db
      .insertInto("finance.provider_movement_conflict")
      .values({
        transactionId,
        reason,
        previousFacts,
        incomingFacts,
        observedAt: new Date(observedAt),
      })
      .onConflict((oc) =>
        oc.columns(["transactionId", "reason"]).doUpdateSet({
          incomingFacts,
          observedAt: new Date(observedAt),
          resolvedAt: null,
        }),
      )
      .execute();
  }
}
