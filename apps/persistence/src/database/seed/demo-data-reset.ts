import {
  type DemoDataResetResult,
  DemoDataResetResultSchema,
} from "@lazyfinance/contracts";
import type { Kysely, Transaction } from "kysely";
import { sql } from "kysely";
import type { AssistantTables } from "../../assistant/assistant.tables";
import type { FinanceTables } from "../../finance/finance.tables";
import { objectives, tags } from "./catalog";
import { userFixtureId } from "./demo-fixture-ids";
import { clp, seedId } from "./helpers";
import {
  buildIncomeReceipts,
  incomeExpectations,
  incomeSources,
} from "./income";
import { buildLedger } from "./ledger";
import {
  type AccountKey,
  accounts,
  demoConnectionId,
  openingBalances,
} from "./profile";

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
  const entries = buildLedger();
  const transactionIds = new Map(
    entries.map((entry) => [entry.id, userFixtureId(userId, entry.id)]),
  );
  const accountIds = new Map(
    Object.values(accounts).map((account) => [
      account.id,
      userFixtureId(userId, account.id),
    ]),
  );
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
    .where("identifier", "=", "manual")
    .executeTakeFirst();
  if (!provider) throw new Error("Manual finance provider is not installed");

  await db
    .insertInto("finance.provider_connection")
    .values({
      id: connectionId,
      userId,
      providerId: provider.id,
      metadata: {},
      mode: "test",
      status: "active",
    })
    .execute();

  for (const key of Object.keys(accounts) as AccountKey[]) {
    const account = accounts[key];
    await db
      .insertInto("finance.account")
      .values({
        ...account,
        id: userFixtureId(userId, account.id),
        userId,
        providerConnectionId: connectionId,
        balance: clp(openingBalances[key]),
      })
      .execute();
  }

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

  const transactions = entries.map((entry) => ({
    ...entry,
    id: requiredId(transactionIds, entry.id),
    accountId: requiredId(accountIds, entry.accountId),
    tagId: entry.tagId ? requiredId(tagIds, entry.tagId) : null,
    externalId: `development-demo:${userId}:${entry.id}`,
    tagDecisionOrigin: entry.tagId
      ? ("manual" as const)
      : ("unreviewed" as const),
    tagDecidedAt: entry.tagId ? entry.bookedAt : null,
  }));
  for (let start = 0; start < transactions.length; start += 100)
    await db
      .insertInto("finance.transaction")
      .values(transactions.slice(start, start + 100))
      .execute();

  const receipts = buildIncomeReceipts(entries).map((receipt) => ({
    ...receipt,
    transactionId: requiredId(transactionIds, receipt.transactionId),
    sourceId: requiredId(sourceIds, receipt.sourceId),
  }));
  for (let start = 0; start < receipts.length; start += 100)
    await db
      .insertInto("finance.income_receipt")
      .values(receipts.slice(start, start + 100))
      .execute();

  const seededAccountIds = [...accountIds.values()];
  const totals = await db
    .selectFrom("finance.transaction")
    .select([
      "accountId",
      sql<string>`coalesce(sum(amount), 0)::text`.as("total"),
    ])
    .where("accountId", "in", seededAccountIds)
    .groupBy("accountId")
    .execute();
  const totalByAccount = new Map(
    totals.map((row) => [row.accountId, Number(row.total)]),
  );
  for (const key of Object.keys(accounts) as AccountKey[]) {
    const id = requiredId(accountIds, accounts[key].id);
    await db
      .updateTable("finance.account")
      .set({
        balance: clp(openingBalances[key] + (totalByAccount.get(id) ?? 0)),
      })
      .where("id", "=", id)
      .execute();
  }

  return DemoDataResetResultSchema.parse({
    transactionCount: entries.length,
  });
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
