import { type Kysely, sql } from "kysely";
import type { FinanceTables } from "../../finance/finance.tables";
import type { IdentityTables } from "../../identity/identity.tables";
import { objectives, tags } from "./catalog";
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
  demoUser,
  openingBalances,
} from "./profile";

function batches<T>(items: T[]): T[][] {
  return Array.from({ length: Math.ceil(items.length / 100) }, (_, i) =>
    items.slice(i * 100, (i + 1) * 100),
  );
}

/** Explicit owner-only demo tooling. Never executed at runtime startup or by migrations. */
export async function seedDemo(
  db: Kysely<FinanceTables & IdentityTables>,
  asOf = new Date(),
) {
  const entries = buildLedger(asOf);
  await db.transaction().execute(async (tx) => {
    await sql`select pg_advisory_xact_lock(hashtextextended('lazyfinance:seed-demo',0))`.execute(
      tx,
    );
    await tx
      .insertInto("identity.user")
      .values(demoUser)
      .onConflict((oc) =>
        oc.column("id").doUpdateSet({
          name: demoUser.name,
          email: demoUser.email,
          createdAt: demoUser.createdAt,
          updatedAt: sql<Date>`now()`,
        }),
      )
      .execute();
    await tx
      .insertInto("identity.external_identity")
      .values({
        provider: "mock",
        issuer: "https://mock.lazyfinance.cl",
        providerSubject: "demo",
        userId: demoUser.id,
      })
      .onConflict((oc) =>
        oc.columns(["provider", "issuer", "providerSubject"]).doNothing(),
      )
      .execute();
    const link = await tx
      .selectFrom("identity.external_identity")
      .select("userId")
      .where("provider", "=", "mock")
      .where("issuer", "=", "https://mock.lazyfinance.cl")
      .where("providerSubject", "=", "demo")
      .executeTakeFirstOrThrow();
    if (link.userId !== demoUser.id)
      throw new Error("Mock identity is linked to another financial user");
    let manualProviderId = "";
    for (const identifier of ["manual", "fintoc"]) {
      const row = await tx
        .insertInto("finance.provider")
        .values({ identifier })
        .onConflict((oc) => oc.column("identifier").doUpdateSet({ identifier }))
        .returning("id")
        .executeTakeFirstOrThrow();
      if (identifier === "manual") manualProviderId = row.id;
    }
    await tx
      .insertInto("finance.provider_connection")
      .values({
        id: demoConnectionId,
        userId: demoUser.id,
        providerId: manualProviderId,
        metadata: {},
        mode: "test",
        status: "active",
        createdAt: demoUser.createdAt,
      })
      .onConflict((oc) =>
        oc.column("id").doUpdateSet({
          providerId: manualProviderId,
          status: "active",
          mode: "test",
          updatedAt: sql<Date>`now()`,
        }),
      )
      .execute();
    for (const key of Object.keys(accounts) as AccountKey[]) {
      const details = accounts[key];
      await tx
        .insertInto("finance.account")
        .values({ ...details, balance: clp(openingBalances[key]) })
        .onConflict((oc) =>
          oc.column("id").doUpdateSet({
            alias: details.alias,
            holderName: details.holderName,
            providerConnectionId: demoConnectionId,
            updatedAt: sql<Date>`now()`,
          }),
        )
        .execute();
    }
    for (const item of tags)
      await tx
        .insertInto("finance.tag")
        .values({
          id: seedId(`tag:${item.key}`),
          userId: demoUser.id,
          name: item.name,
          color: item.color,
          createdAt: demoUser.createdAt,
        })
        .onConflict((oc) =>
          oc.column("id").doUpdateSet({
            name: item.name,
            color: item.color,
            updatedAt: sql<Date>`now()`,
          }),
        )
        .execute();
    for (const item of objectives) {
      const value = {
        ...item.value,
        isRecurring: item.value.isRecurring ?? null,
        period: item.value.period ?? null,
        startDate: item.value.startDate ?? null,
        endDate: item.value.endDate ?? null,
      };
      await tx
        .insertInto("finance.objective")
        .values(value)
        .onConflict((oc) =>
          oc
            .column("id")
            .doUpdateSet({ ...value, updatedAt: sql<Date>`now()` }),
        )
        .execute();
      await tx
        .insertInto("finance.objective_tag")
        .values(
          item.tags.map((key) => ({
            objectiveId: item.value.id,
            tagId: seedId(`tag:${key}`),
          })),
        )
        .onConflict((oc) => oc.columns(["objectiveId", "tagId"]).doNothing())
        .execute();
    }
    for (const source of incomeSources)
      await tx
        .insertInto("finance.income_source")
        .values({ ...source, createdAt: demoUser.createdAt })
        .onConflict((oc) =>
          oc.column("id").doUpdateSet({
            ...source,
            endDate: null,
            archivedAt: null,
            updatedAt: sql<Date>`now()`,
          }),
        )
        .execute();
    for (const expectation of incomeExpectations)
      await tx
        .insertInto("finance.income_expectation")
        .values(expectation)
        .onConflict((oc) =>
          oc.column("id").doUpdateSet({
            date: expectation.date,
            amount: expectation.amount,
            isEstimate: expectation.isEstimate,
          }),
        )
        .execute();
    for (const group of batches(entries))
      await tx
        .insertInto("finance.transaction")
        .values(
          group.map((entry) => ({
            ...entry,
            tagDecisionOrigin: entry.tagId
              ? ("manual" as const)
              : ("unreviewed" as const),
            tagDecidedAt: entry.tagId ? entry.bookedAt : null,
          })),
        )
        .onConflict((oc) =>
          oc.column("id").doUpdateSet((eb) => ({
            accountId: eb.ref("excluded.accountId"),
            bookedAt: eb.ref("excluded.bookedAt"),
            amount: eb.ref("excluded.amount"),
            type: eb.ref("excluded.type"),
            source: eb.ref("excluded.source"),
            merchant: eb.ref("excluded.merchant"),
            description: eb.ref("excluded.description"),
            externalId: eb.ref("excluded.externalId"),
            isInternalMovement: eb.ref("excluded.isInternalMovement"),
          })),
        )
        .execute();
    for (const group of batches(buildIncomeReceipts(entries)))
      await tx
        .insertInto("finance.income_receipt")
        .values(group)
        .onConflict((oc) =>
          oc.column("transactionId").doUpdateSet((eb) => ({
            sourceId: eb.ref("excluded.sourceId"),
            confirmedAt: eb.ref("excluded.confirmedAt"),
          })),
        )
        .execute();
    const totals = await tx
      .selectFrom("finance.transaction")
      .select([
        "accountId",
        sql<string>`coalesce(sum(amount),0)::text`.as("total"),
      ])
      .where(
        "accountId",
        "in",
        Object.values(accounts).map((value) => value.id),
      )
      .groupBy("accountId")
      .execute();
    const totalByAccount = new Map(
      totals.map((row) => [row.accountId, Number(row.total)]),
    );
    for (const key of Object.keys(accounts) as AccountKey[])
      await tx
        .updateTable("finance.account")
        .set({
          balance: clp(
            openingBalances[key] + (totalByAccount.get(accounts[key].id) ?? 0),
          ),
          updatedAt: sql<Date>`now()`,
        })
        .where("id", "=", accounts[key].id)
        .execute();
  });
  return {
    email: demoUser.email,
    transactions: entries.length,
    tags: tags.length,
    objectives: objectives.length,
  };
}
