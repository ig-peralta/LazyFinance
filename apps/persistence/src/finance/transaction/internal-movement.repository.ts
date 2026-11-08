import type { SetInternalMovement } from "@lazyfinance/contracts";
import { Inject, Injectable } from "@nestjs/common";
import { TRPCError } from "@trpc/server";
import { type Kysely, sql } from "kysely";
import { RLS_DB } from "../../database/tokens";
import type { AccountTables } from "../account/account.tables";
import type { ProviderMovementConflictTables } from "../provider-movement-conflict/provider-movement-conflict.tables";
import type { ProviderSyncStateTables } from "../provider-sync-state/provider-sync-state.tables";
import type { TransactionTables } from "./transaction.tables";

type Tables = TransactionTables &
  AccountTables &
  ProviderMovementConflictTables &
  ProviderSyncStateTables;

@Injectable()
export class InternalMovementRepository {
  constructor(@Inject(RLS_DB) private readonly db: Kysely<Tables>) {}

  async set({ id, isInternalMovement: override }: SetInternalMovement) {
    const movement = await this.db
      .selectFrom("finance.transaction")
      .selectAll()
      .where("id", "=", id)
      .forUpdate()
      .executeTakeFirst();
    if (!movement)
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Transaction not found",
      });
    if (movement.removedAt)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Removed movements cannot be classified",
      });

    const conflicts = await this.db
      .selectFrom("finance.provider_movement_conflict")
      .select("reason")
      .where("transactionId", "=", id)
      .where("resolvedAt", "is", null)
      .execute();
    const resolvable = conflicts
      .filter(
        (row) =>
          row.reason === "internal_override_disagrees" ||
          (row.reason === "receipt_incompatible" && movement.type === "credit"),
      )
      .map((row) => row.reason);
    if (resolvable.length)
      await this.db
        .updateTable("finance.provider_movement_conflict")
        .set({ resolvedAt: sql<Date>`clock_timestamp()` })
        .where("transactionId", "=", id)
        .where("reason", "in", resolvable)
        .execute();

    // Acknowledge the current assessment without replacing provider-owned facts.
    // This joined acknowledgement participates in the sync fingerprint.
    if (
      override === false &&
      movement.providerInternalAssessment === "internal"
    ) {
      await this.db
        .insertInto("finance.provider_movement_conflict")
        .values({
          transactionId: id,
          reason: "internal_override_disagrees",
          previousFacts: { isInternalMovement: movement.isInternalMovement },
          incomingFacts: {
            providerInternalAssessment: movement.providerInternalAssessment,
          },
          observedAt:
            movement.providerObservedAt ?? sql<Date>`clock_timestamp()`,
          resolvedAt: sql<Date>`clock_timestamp()`,
        })
        .onConflict((oc) =>
          oc.columns(["transactionId", "reason"]).doUpdateSet({
            incomingFacts: sql<
              Record<string, unknown>
            >`finance.provider_movement_conflict.incoming_facts || ${JSON.stringify({ providerInternalAssessment: movement.providerInternalAssessment })}::jsonb`,
            resolvedAt: sql<Date>`coalesce(finance.provider_movement_conflict.resolved_at,clock_timestamp())`,
          }),
        )
        .execute();
    }

    const effective =
      override ??
      (movement.providerInternalAssessment === "unknown"
        ? null
        : movement.providerInternalAssessment === "internal");
    const reviewStatus =
      movement.reviewStatus === "needs_review" &&
      resolvable.length > 0 &&
      resolvable.length === conflicts.length
        ? ("clear" as const)
        : movement.reviewStatus;
    const decision = await this.db
      .updateTable("finance.transaction")
      .set({
        userInternalOverride: override,
        isInternalMovement: effective,
        reviewStatus,
      })
      .where("id", "=", id)
      .returning([
        "id",
        "isInternalMovement",
        "userInternalOverride",
        "providerInternalAssessment",
        "reviewStatus",
      ])
      .executeTakeFirstOrThrow();

    // Refresh pending counts, not the historical result/time of the last sync.
    await sql`UPDATE finance.provider_sync_state s SET unresolved_conflict_count = (
      SELECT count(*)::int FROM finance.provider_movement_conflict c
      JOIN finance.transaction m ON m.id=c.transaction_id JOIN finance.account a ON a.id=m.account_id
      WHERE a.provider_connection_id=s.provider_connection_id AND c.resolved_at IS NULL)
      WHERE s.provider_connection_id = (SELECT a.provider_connection_id FROM finance.account a WHERE a.id=${movement.accountId}::uuid)`.execute(
      this.db,
    );
    return decision;
  }
}
