import {
  type DemoDataResetResult,
  DemoDataResetResultSchema,
} from "@lazyfinance/contracts";
import { TRPCError } from "@trpc/server";
import type { Kysely, Transaction } from "kysely";
import { sql } from "kysely";
import type { AssistantTables } from "../../assistant/assistant.tables";
import type { FinanceTables } from "../../finance/finance.tables";
import { objectives, tags } from "./catalog";
import { buildDemoBankSource, mainExternalId } from "./demo-bank-source";
import { userFixtureId } from "./demo-fixture-ids";
import { seedId } from "./helpers";
import {
  buildIncomeReceipts,
  incomeExpectations,
  incomeSources,
} from "./income";
import { buildLedger } from "./ledger";
import { type AccountKey, accounts, demoConnectionId } from "./profile";

type DemoToolsTables = FinanceTables & AssistantTables;

function requiredId(ids: ReadonlyMap<string, string>, key: string) {
  const id = ids.get(key);
  if (!id) throw new Error("Demo fixture references an unknown record");
  return id;
}

function ownedAccountIds(db: Kysely<DemoToolsTables>, userId: string) {
  return db
    .selectFrom("finance.account")
    .select("id")
    .where("userId", "=", userId);
}

function ownedConnectionIds(db: Kysely<DemoToolsTables>, userId: string) {
  return db
    .selectFrom("finance.provider_connection")
    .select("id")
    .where("userId", "=", userId);
}

function ownedTransactionIds(db: Kysely<DemoToolsTables>, userId: string) {
  return db
    .selectFrom("finance.transaction as movement")
    .innerJoin("finance.account as account", "account.id", "movement.accountId")
    .select("movement.id")
    .where("account.userId", "=", userId);
}

async function clearAssistantData(
  db: Transaction<DemoToolsTables>,
  userId: string,
) {
  await db
    .deleteFrom("assistant.action")
    .where("userId", "=", userId)
    .execute();
  await db
    .deleteFrom("assistant.conversation")
    .where("userId", "=", userId)
    .execute();
  await db
    .deleteFrom("assistant.processing_consent")
    .where("userId", "=", userId)
    .execute();
}

async function clearFinanceData(
  db: Transaction<DemoToolsTables>,
  userId: string,
) {
  const transactionIds = ownedTransactionIds(db, userId);
  const connectionIds = ownedConnectionIds(db, userId);

  await db
    .deleteFrom("finance.expense_adjustment")
    .where((eb) =>
      eb.or([
        eb("creditTransactionId", "in", transactionIds),
        eb("purchaseTransactionId", "in", transactionIds),
      ]),
    )
    .execute();
  await db
    .deleteFrom("finance.income_receipt")
    .where("transactionId", "in", transactionIds)
    .execute();
  await db
    .deleteFrom("finance.tag_decision_event")
    .where("userId", "=", userId)
    .execute();

  await db
    .deleteFrom("finance.provider_link_intent")
    .where("userId", "=", userId)
    .execute();
  await db
    .deleteFrom("finance.provider_account_selection")
    .where("userId", "=", userId)
    .execute();
  await db
    .deleteFrom("finance.provider_sync_schedule")
    .where("userId", "=", userId)
    .execute();
  await db
    .deleteFrom("finance.provider_sync_state")
    .where("providerConnectionId", "in", connectionIds)
    .execute();
  await db
    .deleteFrom("finance.demo_bank_sync_event")
    .where("userId", "=", userId)
    .execute();
  await db
    .deleteFrom("finance.demo_bank_source")
    .where("userId", "=", userId)
    .execute();
  await db
    .deleteFrom("finance.provider_movement_removal")
    .where("providerConnectionId", "in", connectionIds)
    .execute();

  const savingRevisionIds = db
    .selectFrom("finance.savings_revision as revision")
    .innerJoin(
      "finance.objective as objective",
      "objective.id",
      "revision.objectiveId",
    )
    .select("revision.id")
    .where("objective.userId", "=", userId);
  await db
    .deleteFrom("finance.savings_revision_tag")
    .where("revisionId", "in", savingRevisionIds)
    .execute();
  await db
    .deleteFrom("finance.savings_revision")
    .where(
      "objectiveId",
      "in",
      db
        .selectFrom("finance.objective")
        .select("id")
        .where("userId", "=", userId),
    )
    .execute();

  await db
    .deleteFrom("finance.income_source")
    .where("userId", "=", userId)
    .execute();
  await db
    .deleteFrom("finance.objective")
    .where("userId", "=", userId)
    .execute();
  await db
    .deleteFrom("finance.transaction")
    .where("accountId", "in", ownedAccountIds(db, userId))
    .execute();
  await db
    .deleteFrom("finance.tag_rule")
    .where("userId", "=", userId)
    .execute();
  await db.deleteFrom("finance.account").where("userId", "=", userId).execute();
  await db
    .deleteFrom("finance.provider_connection")
    .where("userId", "=", userId)
    .execute();
  await db.deleteFrom("finance.tag").where("userId", "=", userId).execute();
}

async function seedFinanceData(
  db: Transaction<DemoToolsTables>,
  userId: string,
): Promise<DemoDataResetResult> {
  const fixtureAsOf = new Date();
  const { inventory, movements, entries } = buildDemoBankSource(fixtureAsOf);
  const sourceIds = new Map(
    incomeSources.map((source) => [
      source.id,
      userFixtureId(userId, source.id),
    ]),
  );
  const connectionId = userFixtureId(userId, demoConnectionId);

  const provider = await db
    .selectFrom("finance.provider")
    .select("id")
    .where("identifier", "=", "mock_bank")
    .executeTakeFirst();
  if (!provider) throw new Error("Simulated bank provider is not installed");

  await db
    .insertInto("finance.provider_connection")
    .values({
      id: connectionId,
      userId,
      providerId: provider.id,
      metadata: {},
      mode: "test",
      status: "active",
      holderType: "individual",
      externalId: connectionId,
      institutionId: "demo-bank",
      institutionName: "Banco Demo (simulado)",
    })
    .execute();
  await db
    .insertInto("finance.demo_bank_source")
    .values({
      connectionId,
      userId,
      accounts: JSON.stringify(inventory),
      movements: JSON.stringify(movements),
      failure: null,
      fixtureAsOf,
      initialMovementCount: entries.length,
      updatedAt: fixtureAsOf,
    })
    .execute();
  const months = new Map<string, { at: Date; count: number }>();
  for (const movement of movements) {
    const key = movement.bookedAt.slice(0, 7);
    const previous = months.get(key);
    months.set(key, {
      at: new Date(movement.bookedAt),
      count: (previous?.count ?? 0) + 1,
    });
  }
  await db
    .insertInto("finance.demo_bank_sync_event")
    .values(
      [...months.values()].map(({ at, count }) => ({
        connectionId,
        userId,
        occurredAt: at,
        origin: "generated" as const,
        result: "complete" as const,
        movementCount: count,
        failureReason: null,
      })),
    )
    .execute();

  const tagIds = new Map(
    tags.map((tag) => [
      seedId(`tag:${tag.key}`),
      userFixtureId(userId, seedId(`tag:${tag.key}`)),
    ]),
  );
  for (const tag of tags) {
    await db
      .insertInto("finance.tag")
      .values({
        id: requiredId(tagIds, seedId(`tag:${tag.key}`)),
        userId,
        name: tag.name,
        color: tag.color,
      })
      .execute();
  }

  for (const item of objectives) {
    const value = {
      ...item.value,
      id: userFixtureId(userId, item.value.id),
      userId,
      isRecurring: item.value.isRecurring ?? null,
      period: item.value.period ?? null,
      startDate: item.value.startDate ?? null,
      endDate: item.value.endDate ?? null,
    };
    await db.insertInto("finance.objective").values(value).execute();
    await db
      .insertInto("finance.objective_tag")
      .values(
        item.tags.map((key) => ({
          objectiveId: value.id,
          tagId: requiredId(tagIds, seedId(`tag:${key}`)),
        })),
      )
      .execute();

    if (value.intent !== "spending") continue;
    await db
      .insertInto("finance.budget_revision")
      .values({
        id: value.id,
        objectiveId: value.id,
        version: 1,
        name: value.name,
        amount: value.amount,
        kind: value.kind,
        isRecurring: value.isRecurring,
        period: value.period,
        startDate: value.startDate,
        endDate: value.endDate,
        effectiveFrom: value.startDate ?? sql<Date>`now()`,
        supersededAt: null,
      })
      .execute();
    await db
      .insertInto("finance.budget_revision_tag")
      .values(
        item.tags.map((key) => ({
          revisionId: value.id,
          tagId: requiredId(tagIds, seedId(`tag:${key}`)),
        })),
      )
      .execute();
  }

  for (const source of incomeSources) {
    await db
      .insertInto("finance.income_source")
      .values({ ...source, id: requiredId(sourceIds, source.id), userId })
      .execute();
  }
  await db
    .insertInto("finance.income_expectation")
    .values(
      incomeExpectations.map((expectation) => ({
        ...expectation,
        id: userFixtureId(userId, expectation.id),
        sourceId: requiredId(sourceIds, expectation.sourceId),
      })),
    )
    .execute();

  return DemoDataResetResultSchema.parse({
    transactionCount: entries.length,
    connectionId,
    status: "incomplete",
  });
}

export async function finalizeDemoDataInTransaction(
  tx: Transaction<DemoToolsTables>,
  userId: string,
) {
  await sql`select pg_advisory_xact_lock(hashtextextended(${`lazyfinance:user:${userId}`}, 0))`.execute(
    tx,
  );
  const connectionId = userFixtureId(userId, demoConnectionId);
  const source = await tx
    .selectFrom("finance.demo_bank_source")
    .select(["prepared", "connectionId", "fixtureAsOf", "initialMovementCount"])
    .where("userId", "=", userId)
    .where("connectionId", "=", connectionId)
    .executeTakeFirst();
  if (!source)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Prepare demo data first",
    });
  if (source.prepared)
    return {
      connectionId,
      transactionCount: source.initialMovementCount,
      status: "ready" as const,
    };
  const entries = buildLedger(source.fixtureAsOf);
  if (entries.length !== source.initialMovementCount)
    throw new Error("Demo fixture does not match its original source");
  const mainByAccountId = new Map(
    (Object.keys(accounts) as AccountKey[]).map((key) => [
      accounts[key].id,
      mainExternalId(key),
    ]),
  );
  const expected = entries.map((entry) => ({
    accountExternalId: requiredId(mainByAccountId, entry.accountId),
    externalId: entry.externalId,
  }));
  const { rows: imported } = await sql<{
    total: number;
  }>`SELECT count(*)::int AS total
    FROM finance."transaction" m
    JOIN finance.account a ON a.id = m.account_id
    JOIN jsonb_to_recordset(${JSON.stringify(expected)}::jsonb)
      AS e("accountExternalId" text, "externalId" text)
      ON e."accountExternalId" = a.external_id AND e."externalId" = m.external_id
    WHERE a.provider_connection_id = ${connectionId}::uuid
      AND m.source = 'provider' AND m.removed_at IS NULL`.execute(tx);
  if (imported[0]?.total !== entries.length)
    throw new TRPCError({
      code: "CONFLICT",
      message: "Demo bank initial import is not complete",
    });
  const decisions = entries
    .filter(
      (entry): entry is typeof entry & { tagId: string } =>
        entry.tagId !== null,
    )
    .map((entry) => ({
      externalId: entry.externalId,
      tagId: userFixtureId(userId, entry.tagId),
    }));
  await sql`UPDATE finance."transaction" m
    SET tag_id = d."tagId", tag_decision_origin = 'manual', tag_decided_at = m.booked_at
    FROM finance.account a, jsonb_to_recordset(${JSON.stringify(decisions)}::jsonb)
      AS d("externalId" text, "tagId" uuid)
    WHERE a.id = m.account_id AND a.provider_connection_id = ${connectionId}::uuid
      AND m.external_id = d."externalId" AND m.source = 'provider'`.execute(tx);
  const externalIdById = new Map(
    entries.map((entry) => [entry.id, entry.externalId]),
  );
  const receipts = buildIncomeReceipts(entries).map((receipt) => {
    const externalId = externalIdById.get(receipt.transactionId);
    if (!externalId)
      throw new Error("Demo receipt references an unknown movement");
    return { externalId, sourceId: userFixtureId(userId, receipt.sourceId) };
  });
  await sql`INSERT INTO finance.income_receipt (transaction_id, source_id, confirmed_at)
    SELECT m.id, r."sourceId", m.booked_at
    FROM finance."transaction" m
    JOIN finance.account a ON a.id = m.account_id
    JOIN jsonb_to_recordset(${JSON.stringify(receipts)}::jsonb)
      AS r("externalId" text, "sourceId" uuid) ON r."externalId" = m.external_id
    WHERE a.provider_connection_id = ${connectionId}::uuid AND m.source = 'provider'`.execute(
    tx,
  );
  await tx
    .updateTable("finance.demo_bank_source")
    .set({ prepared: true })
    .where("connectionId", "=", connectionId)
    .where("userId", "=", userId)
    .execute();
  return {
    connectionId,
    transactionCount: entries.length,
    status: "ready" as const,
  };
}

export async function resetDemoDataInTransaction(
  tx: Transaction<DemoToolsTables>,
  userId: string,
): Promise<DemoDataResetResult> {
  await sql`select pg_advisory_xact_lock(hashtextextended(${`lazyfinance:user:${userId}`}, 0))`.execute(
    tx,
  );
  await clearAssistantData(tx, userId);
  await clearFinanceData(tx, userId);
  return seedFinanceData(tx, userId);
}
