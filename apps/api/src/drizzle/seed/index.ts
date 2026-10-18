import { eq, inArray, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { loadEnvironmentVariables } from '../../environment/environment.loader';
import * as schema from '../schema';
import { objectives, tags } from './catalog';
import { clp, seedId } from './helpers';
import { buildLedger } from './ledger';
import { accounts, demoConnectionId, demoUser, openingBalances, type AccountKey } from './profile';

const batchSize = 100;

function batches<T>(items: T[]): T[][] {
  const result: T[][] = [];
  for (let start = 0; start < items.length; start += batchSize) {
    result.push(items.slice(start, start + batchSize));
  }
  return result;
}

async function seed() {
  const { POSTGRES_URL } = loadEnvironmentVariables();
  const client = postgres(POSTGRES_URL);

  try {
    const db = drizzle(client, { schema });
    const entries = buildLedger();

    await db.transaction(async (tx) => {
      await tx.insert(schema.user).values(demoUser).onConflictDoUpdate({
        target: schema.user.id,
        set: { name: demoUser.name, email: demoUser.email, apiToken: demoUser.apiToken, createdAt: demoUser.createdAt },
      });

      let manualProviderId = '';
      for (const identifier of ['manual', 'fintoc'] as const) {
        const [row] = await tx.insert(schema.provider).values({ identifier }).onConflictDoUpdate({
          target: schema.provider.identifier,
          set: { identifier },
        }).returning({ id: schema.provider.id });
        if (identifier === 'manual') manualProviderId = row.id;
      }

      await tx.insert(schema.providerConnection).values({
        id: demoConnectionId,
        userId: demoUser.id,
        providerId: manualProviderId,
        metadata: {},
        mode: 'test',
        status: 'active',
        createdAt: demoUser.createdAt,
      }).onConflictDoUpdate({
        target: schema.providerConnection.id,
        set: { providerId: manualProviderId, status: 'active', mode: 'test' },
      });

      for (const key of Object.keys(accounts) as AccountKey[]) {
        const details = accounts[key];
        await tx.insert(schema.account).values({ ...details, balance: clp(openingBalances[key]) }).onConflictDoUpdate({
          target: schema.account.id,
          set: { alias: details.alias, holderName: details.holderName, providerConnectionId: demoConnectionId },
        });
      }

      for (const item of tags) {
        await tx.insert(schema.tag).values({
          id: seedId(`tag:${item.key}`),
          userId: demoUser.id,
          name: item.name,
          color: item.color,
          createdAt: demoUser.createdAt,
        }).onConflictDoUpdate({
          target: schema.tag.id,
          set: { name: item.name, color: item.color },
        });
      }

      for (const item of objectives) {
        await tx.insert(schema.objective).values(item.value).onConflictDoUpdate({
          target: schema.objective.id,
          set: {
            name: item.value.name,
            amount: item.value.amount,
            kind: item.value.kind,
            intent: item.value.intent,
            isRecurring: item.value.isRecurring ?? null,
            period: item.value.period ?? null,
            startDate: item.value.startDate ?? null,
            endDate: item.value.endDate ?? null,
          },
        });
        await tx.insert(schema.objectiveTag).values(item.tags.map((key) => ({
          objectiveId: item.value.id,
          tagId: seedId(`tag:${key}`),
        }))).onConflictDoNothing();
      }

      for (const group of batches(entries)) {
        await tx.insert(schema.transaction).values(group.map(({ tags: _, ...entry }) => entry)).onConflictDoUpdate({
          target: schema.transaction.id,
          set: {
            accountId: sql`excluded.account_id`,
            bookedAt: sql`excluded.booked_at`,
            amount: sql`excluded.amount`,
            type: sql`excluded.type`,
            source: sql`excluded.source`,
            merchant: sql`excluded.merchant`,
            description: sql`excluded.description`,
            externalId: sql`excluded.external_id`,
            isInternalMovement: sql`excluded.is_internal_movement`,
          },
        });
      }

      const links = entries.flatMap((entry) => entry.tags.map((key) => ({
        transactionId: entry.id,
        tagId: seedId(`tag:${key}`),
      })));
      for (const group of batches(links)) {
        await tx.insert(schema.transactionTag).values(group).onConflictDoNothing();
      }

      const totals = await tx.select({
        accountId: schema.transaction.accountId,
        total: sql<string>`coalesce(sum(${schema.transaction.amount}), 0)`,
      }).from(schema.transaction)
        .where(inArray(schema.transaction.accountId, Object.values(accounts).map((value) => value.id)))
        .groupBy(schema.transaction.accountId);
      const totalByAccount = new Map(totals.map(({ accountId, total }) => [accountId, Number(total)]));

      for (const key of Object.keys(accounts) as AccountKey[]) {
        await tx.update(schema.account).set({
          balance: clp(openingBalances[key] + (totalByAccount.get(accounts[key].id) ?? 0)),
        }).where(eq(schema.account.id, accounts[key].id));
      }
    });

    console.log(`Seeded ${demoUser.email}: ${entries.length} CLP transactions, ${tags.length} tags, ${objectives.length} objectives.`);
  } finally {
    await client.end();
  }
}

seed().catch((error: unknown) => {
  console.error('Failed to seed demo data:', error);
  process.exitCode = 1;
});
