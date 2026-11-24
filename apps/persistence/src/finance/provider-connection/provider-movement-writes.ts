import type { PreparedProviderMovement } from "@lazyfinance/contracts/internal";
import { TRPCError } from "@trpc/server";
import { type Kysely, type Selectable, sql } from "kysely";
import type { FinanceTables } from "../finance.tables";
import type { TransactionTable } from "../transaction/transaction.tables";

export type ProviderMovementWrite = Omit<
  PreparedProviderMovement,
  | "accountExternalId"
  | "decision"
  | "bookedAt"
  | "providerObservedAt"
  | "providerUpdatedAt"
> & {
  accountId: string;
  bookedAt: Date;
  providerObservedAt: Date;
  providerUpdatedAt: Date | null;
  isInternalMovement: boolean | null;
  reviewStatus: "clear" | "needs_review";
};

/** Bounded writes in the caller's existing scoped transaction and user lock. */
export async function writeProviderMovementBatch(
  db: Kysely<FinanceTables>,
  batch: { movement: ProviderMovementWrite; existing: boolean }[],
  returnRows: boolean,
) {
  const saved: Selectable<TransactionTable>[] = [];
  const inserts = batch
    .filter((item) => !item.existing)
    .map(({ movement }) => ({ ...movement, source: "provider" as const }));
  if (inserts.length) {
    const query = db.insertInto("finance.transaction").values(inserts);
    if (returnRows) saved.push(...(await query.returningAll().execute()));
    else await query.execute();
  }

  const updates = batch
    .filter((item) => item.existing)
    .map(({ movement }) => movement);
  if (updates.length) {
    // JSON recordsets already carry bounded provider key lists. Here each column is
    // typed explicitly; only provider/effective fields can change, never decisions.
    const result = await sql<
      Selectable<TransactionTable>
    >`UPDATE finance.transaction AS m SET
      amount=w.amount, type=w.type, booked_at=w."bookedAt", booked_precision=w."bookedPrecision",
      booked_on=w."bookedOn", description=w.description, merchant=w.merchant,
      provider_updated_at=w."providerUpdatedAt", provider_observed_at=w."providerObservedAt",
      provider_kind=w."providerKind", relation_kind=w."relationKind",
      related_account_external_id=w."relatedAccountExternalId", related_movement_external_id=w."relatedMovementExternalId",
      counterparty_holder=w."counterpartyHolder", provider_internal_assessment=w."providerInternalAssessment",
      is_internal_movement=w."isInternalMovement", review_status=w."reviewStatus"
      FROM jsonb_to_recordset(${JSON.stringify(updates)}::jsonb) AS w(
        id uuid, "accountId" uuid, "externalId" text, amount numeric, type finance.transaction_type,
        "bookedAt" timestamptz, "bookedPrecision" finance.booked_precision, "bookedOn" date,
        description text, merchant text, "providerUpdatedAt" timestamptz, "providerObservedAt" timestamptz,
        "providerKind" text, "relationKind" finance.movement_relation,
        "relatedAccountExternalId" text, "relatedMovementExternalId" text, "counterpartyHolder" jsonb,
        "providerInternalAssessment" finance.provider_internal_assessment, "isInternalMovement" boolean,
        "reviewStatus" finance.movement_review_status)
      WHERE m.id=w.id AND m.account_id=w."accountId" AND m.external_id=w."externalId" AND m.source='provider'
      ${returnRows ? sql`RETURNING m.*` : sql``}`.execute(db);
    const changed = returnRows
      ? BigInt(result.rows.length)
      : result.numAffectedRows;
    if (changed !== BigInt(updates.length))
      throw new TRPCError({
        code: "CONFLICT",
        message: "Provider movement identity changed",
      });
    saved.push(...result.rows);
  }

  return new Map(saved.map((movement) => [movement.id, movement]));
}
