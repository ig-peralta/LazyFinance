import type {
  CommitProviderSync,
  ProviderSyncFacts,
} from "@lazyfinance/contracts/internal";
import { TRPCError } from "@trpc/server";
import { type Kysely, sql } from "kysely";
import type { FinanceTables } from "../finance.tables";

export function resolveProviderSuspension(
  db: Kysely<FinanceTables>,
  transactionId: string,
) {
  return db
    .updateTable("finance.provider_movement_conflict")
    .set({ resolvedAt: sql<Date>`clock_timestamp()` })
    .where("transactionId", "=", transactionId)
    .where("reason", "=", "provider_unbooked")
    .where("resolvedAt", "is", null)
    .execute();
}

/** Called only after the owning commit has revalidated its scope/fingerprint. */
export async function applyProviderSuspensions(
  db: Kysely<FinanceTables>,
  input: CommitProviderSync,
  accounts: ReadonlySet<string>,
  movements: ReadonlyMap<string, ProviderSyncFacts["movements"][number]>,
  tombstones: ReadonlySet<string>,
  keys: ReadonlySet<string>,
) {
  const removals = new Set(
    input.removals.map((row) =>
      JSON.stringify([row.accountExternalId, row.externalId]),
    ),
  );
  const booked = new Set(
    input.movements.map((row) =>
      JSON.stringify([row.accountExternalId, row.externalId]),
    ),
  );
  for (const suspension of input.suspensions ?? []) {
    const key = JSON.stringify([
      suspension.accountExternalId,
      suspension.externalId,
    ]);
    if (
      !keys.has(key) ||
      !accounts.has(suspension.accountExternalId) ||
      booked.has(key) ||
      new Date(suspension.observedAt) > new Date(input.observedAt)
    )
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Suspension is outside the prepared scope",
      });
    const previous = movements.get(key);
    if (
      !previous ||
      previous.removedAt ||
      tombstones.has(key) ||
      removals.has(key)
    )
      continue;
    if (
      previous.source !== "provider" ||
      (previous.providerObservedAt &&
        new Date(suspension.observedAt) <
          new Date(previous.providerObservedAt)) ||
      (previous.providerUpdatedAt &&
        suspension.providerUpdatedAt &&
        new Date(suspension.providerUpdatedAt) <
          new Date(previous.providerUpdatedAt))
    )
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Stale or invalid movement suspension",
      });
    await db
      .updateTable("finance.transaction")
      .set({
        reviewStatus: "needs_review",
        providerObservedAt: new Date(suspension.observedAt),
        ...(suspension.providerUpdatedAt
          ? { providerUpdatedAt: new Date(suspension.providerUpdatedAt) }
          : {}),
      })
      .where("id", "=", previous.id)
      .execute();
    const incomingFacts = { providerBookingStatus: suspension.reason };
    await db
      .insertInto("finance.provider_movement_conflict")
      .values({
        transactionId: previous.id,
        reason: "provider_unbooked",
        previousFacts: {
          amount: previous.amount,
          type: previous.type,
          bookedAt: previous.bookedAt,
        },
        incomingFacts,
        observedAt: new Date(suspension.observedAt),
        resolvedAt: null,
      })
      .onConflict((oc) =>
        oc.columns(["transactionId", "reason"]).doUpdateSet({
          incomingFacts,
          observedAt: new Date(suspension.observedAt),
          resolvedAt: null,
        }),
      )
      .execute();
  }
}
