import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccountRepository } from '../../drizzle/repositories/account.repository';
import { IncomeRepository } from '../../drizzle/repositories/income.repository';
import { TransactionRepository } from '../../drizzle/repositories/transaction.repository';
import * as schema from '../../drizzle/schema';
import { migrateTestDatabase } from '../../drizzle/test-migrations';
import { IncomeService } from '../../income/income.service';

describe.skipIf(!process.env.TEST_POSTGRES_URL)('normalized banking storage against PostgreSQL', () => {
  let client: ReturnType<typeof postgres>;

  beforeAll(() => {
    client = postgres(process.env.TEST_POSTGRES_URL!, { max: 1 });
  });

  afterAll(async () => client?.end());

  it('preserves identity, unknown balances and decisions while excluding unresolved and removed movements', async () => {
    const db = drizzle(client, { schema });
    await migrateTestDatabase(db, process.env.TEST_POSTGRES_URL!);
    const rollback = new Error('Rollback normalized banking fixtures');

    await db.transaction(async (tx) => {
      const userId = randomUUID();
      const otherUserId = randomUUID();
      await tx.insert(schema.user).values([
        { id: userId, name: 'Owner', email: `${userId}@test.local` },
        { id: otherUserId, name: 'Other', email: `${otherUserId}@test.local` },
      ]);
      await tx.insert(schema.provider).values({ identifier: 'fixture-bank' }).onConflictDoNothing();
      const [provider] = await tx.select().from(schema.provider).where(eq(schema.provider.identifier, 'fixture-bank'));
      const firstConnection = randomUUID();
      const secondConnection = randomUUID();
      await tx.insert(schema.providerConnection).values([
        { id: firstConnection, userId, providerId: provider.id, mode: 'test' },
        { id: secondConnection, userId: otherUserId, providerId: provider.id, mode: 'test' },
      ]);

      const firstAccount = randomUUID();
      const secondAccount = randomUUID();
      const otherAccount = randomUUID();
      await tx.insert(schema.account).values([
        {
          id: firstAccount, providerConnectionId: firstConnection, userId, externalId: 'external-1',
          type: 'checking', number: '****1234', holderName: null, balance: '1160.00',
          historyCompleteness: 'partial', historyFrom: '2026-10-01', historyThrough: '2026-10-15',
          lastSyncedAt: new Date('2026-10-15T17:00:00Z'),
        },
        {
          id: secondAccount, providerConnectionId: firstConnection, userId, externalId: 'external-2',
          type: 'checking', number: '****1234', holderName: null, balance: null,
        },
        {
          id: otherAccount, providerConnectionId: secondConnection, userId: otherUserId, externalId: 'external-1',
          type: 'checking', number: '****1234', holderName: null, balance: '999.00',
        },
      ]);
      const accounts = await new AccountRepository(tx).listActiveForUser(userId);
      expect(accounts).toHaveLength(2);
      const balances = new Map(accounts.map(({ id, balance }) => [id, balance]));
      expect(balances.get(firstAccount)).toBe('1160.00');
      expect(balances.get(secondAccount)).toBeNull();

      const movementId = randomUUID();
      const tagId = randomUUID();
      await tx.insert(schema.tag).values({ id: tagId, userId, name: 'Clasificación personal' });
      await tx.insert(schema.transaction).values({
        id: movementId, accountId: firstAccount, externalId: 'provider-credit', source: 'provider',
        bookedAt: new Date('2026-10-15T15:00:00Z'), bookedPrecision: 'calendar_day', bookedOn: '2026-10-15',
        amount: '500.00', type: 'credit', tagId, tagDecisionOrigin: 'manual', providerKind: 'other', isInternalMovement: null,
      });
      const transactions = new TransactionRepository(tx);
      const asOf = new Date('2026-10-20T18:00:00Z');
      expect(await transactions.sumByMonthForUser(userId, '2026-10', asOf)).toMatchObject({
        unclassifiedCreditAmount: '0.00', unresolvedMovementCount: 1,
      });

      const [source] = await tx.insert(schema.incomeSource).values({
        userId, name: 'Ingreso confirmado', currency: 'CLP', regularity: 'irregular',
        amountKind: 'variable', schedule: null, startDate: '2026-01-01',
      }).returning();
      const income = new IncomeService(new IncomeRepository(tx));
      await expect(income.confirmReceiptForUser(userId, movementId, { sourceId: source.id }, asOf))
        .rejects.toThrow('Received income requires a booked, non-internal credit transaction');

      // A resolved non-internal credit can be explicitly confirmed as income.
      await tx.update(schema.transaction).set({ isInternalMovement: false, userInternalOverride: false })
        .where(eq(schema.transaction.id, movementId));
      await income.confirmReceiptForUser(userId, movementId, { sourceId: source.id }, asOf);
      expect(await transactions.sumByMonthForUser(userId, '2026-10', asOf)).toMatchObject({
        receivedIncome: '500.00', unresolvedMovementCount: 0,
      });

      const removedAt = new Date('2026-10-19T18:00:00Z');
      await tx.insert(schema.providerMovementRemoval).values({
        providerConnectionId: firstConnection, accountExternalId: 'external-1',
        movementExternalId: 'provider-credit', reason: 'reversed', observedAt: removedAt,
      }).onConflictDoNothing();
      await tx.insert(schema.providerMovementRemoval).values({
        providerConnectionId: firstConnection, accountExternalId: 'external-1',
        movementExternalId: 'provider-credit', reason: 'reversed', observedAt: removedAt,
      }).onConflictDoNothing();
      await tx.update(schema.transaction).set({ removedAt, removalReason: 'reversed' })
        .where(eq(schema.transaction.id, movementId));
      await expect(income.confirmReceiptForUser(userId, movementId, { sourceId: source.id }, asOf))
        .rejects.toThrow('Received income requires a booked, non-internal credit transaction');

      expect(await transactions.sumByMonthForUser(userId, '2026-10', asOf)).toMatchObject({
        receivedIncome: '0.00', unresolvedMovementCount: 0,
      });
      expect(await transactions.listRecentForUser(userId)).toEqual([]);
      expect(await new IncomeRepository(tx).listReceiptsForMonth(userId, '2026-10', asOf)).toEqual([]);
      const [retained] = await tx.select().from(schema.transaction).where(eq(schema.transaction.id, movementId));
      expect(retained).toMatchObject({ tagId, userInternalOverride: false, removalReason: 'reversed' });
      expect(await tx.select().from(schema.incomeReceipt).where(eq(schema.incomeReceipt.transactionId, movementId)))
        .toHaveLength(1);
      expect(await tx.select().from(schema.providerMovementRemoval)
        .where(eq(schema.providerMovementRemoval.providerConnectionId, firstConnection))).toHaveLength(1);

      await tx.insert(schema.providerSyncState).values({
        providerConnectionId: firstConnection, checkpoint: 'last-good',
        lastSuccessAt: new Date('2026-10-15T18:00:00Z'), lastAttemptAt: removedAt,
        lastFailureAt: removedAt, lastFailureReason: 'retryable',
      });
      const [sync] = await tx.select().from(schema.providerSyncState)
        .where(eq(schema.providerSyncState.providerConnectionId, firstConnection));
      expect(sync).toMatchObject({ checkpoint: 'last-good', lastFailureReason: 'retryable' });
      throw rollback;
    }).catch((error) => { if (error !== rollback) throw error; });
  });
});
