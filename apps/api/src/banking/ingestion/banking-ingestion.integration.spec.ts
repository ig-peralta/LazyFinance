import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AccountRepository } from '../../drizzle/repositories/account.repository';
import { IncomeRepository } from '../../drizzle/repositories/income.repository';
import { TransactionRepository } from '../../drizzle/repositories/transaction.repository';
import * as schema from '../../drizzle/schema';
import { migrateTestDatabase } from '../../drizzle/test-migrations';
import { IncomeService } from '../../income/income.service';
import { TaggingService } from '../../transactions/tagging/tagging.service';
import type { BankingConnector } from '../connector/banking-connector';
import {
  correctionPage, expiredFailure, initialPage, removalPage, retryableFailure, unknownBalancePage,
} from '../connector/fixtures/normalized-pages';
import type { ConnectorPage, ConnectorResult } from '../connector/normalized-banking.schema';
import { BankingIngestionService } from './banking-ingestion.service';

type Database = PostgresJsDatabase<typeof schema>;
type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

const connector = (result: ConnectorResult): BankingConnector => ({
  provider: 'fixture-bank', fetchPage: vi.fn(async () => result),
});

describe.skipIf(!process.env.TEST_POSTGRES_URL)('owned normalized banking ingestion against PostgreSQL', () => {
  let client: ReturnType<typeof postgres>;
  let db: Database;

  beforeAll(async () => {
    client = postgres(process.env.TEST_POSTGRES_URL!, { max: 4 });
    db = drizzle(client, { schema });
    await migrateTestDatabase(db, process.env.TEST_POSTGRES_URL!);
  });
  afterAll(async () => client?.end());

  async function withConnection(work: (context: {
    tx: Tx; userId: string; otherUserId: string; connectionId: string; otherConnectionId: string;
    ingestion: BankingIngestionService;
  }) => Promise<void>) {
    const rollback = new Error('Rollback fixture');
    await db.transaction(async (tx) => {
      const userId = randomUUID();
      const otherUserId = randomUUID();
      await tx.insert(schema.user).values([
        { id: userId, name: 'Owner', email: `${userId}@test.local` },
        { id: otherUserId, name: 'Other', email: `${otherUserId}@test.local` },
      ]);
      await tx.insert(schema.provider).values({ identifier: 'fixture-bank' }).onConflictDoNothing();
      const [provider] = await tx.select().from(schema.provider)
        .where(eq(schema.provider.identifier, 'fixture-bank'));
      const connectionId = randomUUID();
      const otherConnectionId = randomUUID();
      await tx.insert(schema.providerConnection).values([
        { id: connectionId, userId, providerId: provider.id, mode: 'test' },
        { id: otherConnectionId, userId: otherUserId, providerId: provider.id, mode: 'test' },
      ]);
      const ingestion = new BankingIngestionService(tx as unknown as Database, new TaggingService(tx as unknown as Database));
      await work({ tx, userId, otherUserId, connectionId, otherConnectionId, ingestion });
      throw rollback;
    }).catch((error) => { if (error !== rollback) throw error; });
  }

  it('imports and replays owned facts, preserves decisions, and corrects only provider-owned fields', async () => {
    await withConnection(async ({ tx, userId, connectionId, ingestion }) => {
      const first = await ingestion.syncForUser(userId, connectionId, connector(initialPage));
      expect(first).toEqual({ status: 'complete', conflictCount: 0, checkpoint: 'through-2026-10-15' });
      const accounts = await new AccountRepository(tx).listActiveForUser(userId);
      expect(accounts).toHaveLength(3);
      expect(new Map(accounts.map((row) => [row.type, row.balance]))).toEqual(new Map([
        ['checking', '1160.00'], ['savings', '300.00'], ['credit_card', '-40.00'],
      ]));
      const checking = (await tx.select().from(schema.account).where(and(
        eq(schema.account.providerConnectionId, connectionId), eq(schema.account.externalId, 'checking-1'),
      )))[0];
      expect(checking).toMatchObject({ historyCompleteness: 'partial', historyFrom: '2026-10-01' });

      const grocery = (await tx.select().from(schema.transaction).where(and(
        eq(schema.transaction.accountId, checking.id), eq(schema.transaction.externalId, 'grocery-1'),
      )))[0];
      const salary = (await tx.select().from(schema.transaction).where(and(
        eq(schema.transaction.accountId, checking.id), eq(schema.transaction.externalId, 'salary-1'),
      )))[0];
      expect(salary.bookedOn).toBe('2026-10-10');
      expect(salary.bookedAt.toISOString()).toBe('2026-10-10T15:00:00.000Z');
      expect(salary.isInternalMovement).toBeNull();
      const totals = new TransactionRepository(tx);
      expect(await totals.sumByMonthForUser(userId, '2026-10')).toMatchObject({
        spending: '200.00', receivedIncome: '0.00', unclassifiedCreditAmount: '20.00', unresolvedMovementCount: 1,
      });

      const tagId = randomUUID();
      await tx.insert(schema.tag).values({ id: tagId, userId, name: 'Personal' });
      await tx.update(schema.account).set({ alias: 'Mi cuenta' }).where(eq(schema.account.id, checking.id));
      await tx.update(schema.transaction).set({ tagId, tagDecisionOrigin: 'manual' }).where(eq(schema.transaction.id, grocery.id));
      await tx.update(schema.transaction).set({ userInternalOverride: false, isInternalMovement: false })
        .where(eq(schema.transaction.id, salary.id));
      const [source] = await tx.insert(schema.incomeSource).values({
        userId, name: 'Salary', currency: 'CLP', regularity: 'irregular', amountKind: 'variable',
        schedule: null, startDate: '2026-01-01',
      }).returning();
      await new IncomeService(new IncomeRepository(tx)).confirmReceiptForUser(userId, salary.id, { sourceId: source.id });

      expect((await ingestion.syncForUser(userId, connectionId, connector(initialPage))).status).toBe('complete');
      expect((await ingestion.syncForUser(userId, connectionId, connector(correctionPage))).status).toBe('complete');
      const [after] = await tx.select().from(schema.transaction).where(eq(schema.transaction.id, grocery.id));
      expect(after).toMatchObject({ amount: '-120.00', description: 'Corrected groceries', tagId });
      expect((await tx.select().from(schema.account).where(eq(schema.account.id, checking.id)))[0])
        .toMatchObject({ alias: 'Mi cuenta', balance: '1140.00' });
      expect((await tx.select().from(schema.transaction).where(eq(schema.transaction.accountId, checking.id)))
        .filter((row) => row.externalId === 'grocery-1')).toHaveLength(1);
      expect(await totals.sumByMonthForUser(userId, '2026-10')).toMatchObject({
        spending: '220.00', receivedIncome: '500.00', unresolvedMovementCount: 0,
      });
      expect(await ingestion.syncForUser(userId, connectionId, connector(initialPage)))
        .toMatchObject({ status: 'failed', reason: 'invalid_data' });
      expect((await tx.select().from(schema.transaction).where(eq(schema.transaction.id, grocery.id)))[0].amount)
        .toBe('-120.00');
      expect((await tx.select().from(schema.providerSyncState)
        .where(eq(schema.providerSyncState.providerConnectionId, connectionId)))[0].checkpoint)
        .toBe('through-2026-10-17');
      const [beforeFailure] = await tx.select().from(schema.providerSyncState)
        .where(eq(schema.providerSyncState.providerConnectionId, connectionId));
      expect(await ingestion.syncForUser(userId, connectionId, connector(retryableFailure)))
        .toMatchObject({ status: 'failed', reason: 'retryable' });
      const [afterFailure] = await tx.select().from(schema.providerSyncState)
        .where(eq(schema.providerSyncState.providerConnectionId, connectionId));
      expect(afterFailure.checkpoint).toBe(beforeFailure.checkpoint);
      expect(afterFailure.lastSuccessAt).toEqual(beforeFailure.lastSuccessAt);
      expect((await tx.select().from(schema.account).where(eq(schema.account.id, checking.id)))[0].balance)
        .toBe('1140.00');
      expect(await tx.select().from(schema.incomeReceipt).where(eq(schema.incomeReceipt.transactionId, salary.id)))
        .toHaveLength(1);
    });
  });

  it('applies a conflicting correction while suspending the interpretation and preserving a review trail', async () => {
    await withConnection(async ({ tx, userId, otherUserId, connectionId, ingestion }) => {
      await ingestion.syncForUser(userId, connectionId, connector(initialPage));
      const [checking] = await tx.select().from(schema.account).where(eq(schema.account.externalId, 'checking-1'));
      const [salary] = await tx.select().from(schema.transaction).where(and(
        eq(schema.transaction.accountId, checking.id), eq(schema.transaction.externalId, 'salary-1'),
      ));
      const tagId = randomUUID();
      await tx.insert(schema.tag).values({ id: tagId, userId, name: 'Income tag' });
      await tx.update(schema.transaction).set({ userInternalOverride: false, isInternalMovement: false,
        tagId, tagDecisionOrigin: 'manual' })
        .where(eq(schema.transaction.id, salary.id));
      const [source] = await tx.insert(schema.incomeSource).values({
        userId, name: 'Salary', currency: 'CLP', regularity: 'irregular', amountKind: 'variable',
        schedule: null, startDate: '2026-01-01',
      }).returning();
      await new IncomeService(new IncomeRepository(tx)).confirmReceiptForUser(userId, salary.id, { sourceId: source.id });
      const signFlip = {
        ...initialPage, observedAt: '2026-10-18T18:00:00.000Z', checkpoint: 'through-sign-flip',
        accounts: [{ ...initialPage.accounts[0], reportedBalance: {
          ...initialPage.accounts[0].reportedBalance, amount: '160.00', asOf: '2026-10-18T17:00:00.000Z',
        } }],
        movements: [{ ...initialPage.movements[0], amount: '-500.00' }],
      } satisfies ConnectorPage;
      const result = await ingestion.syncForUser(userId, connectionId, connector(signFlip));
      expect(result).toEqual({ status: 'needs_review', conflictCount: 1, checkpoint: 'through-sign-flip' });
      const [corrected] = await tx.select().from(schema.transaction).where(eq(schema.transaction.id, salary.id));
      expect(corrected).toMatchObject({ amount: '-500.00', type: 'debit', tagId, reviewStatus: 'needs_review' });
      expect(await new TransactionRepository(tx).sumByMonthForUser(userId, '2026-10')).toMatchObject({
        receivedIncome: '0.00', spending: '200.00', unresolvedMovementCount: 1,
      });
      expect((await new AccountRepository(tx).listActiveForUser(userId)).find((row) => row.id === checking.id)?.balance)
        .toBe('160.00');
      expect(await new IncomeRepository(tx).listReceiptsForMonth(userId, '2026-10', new Date('2026-10-20T18:00:00Z')))
        .toEqual([]);
      expect(await tx.select().from(schema.incomeReceipt).where(eq(schema.incomeReceipt.transactionId, salary.id)))
        .toHaveLength(1);
      expect(await ingestion.listPendingReviewForUser(otherUserId)).toEqual([]);
      expect(await ingestion.listPendingReviewForUser(userId)).toMatchObject([{
        transactionId: salary.id, tagId, incomeSourceId: source.id, reason: 'receipt_incompatible',
      }]);
      expect((await tx.select().from(schema.providerSyncState)
        .where(eq(schema.providerSyncState.providerConnectionId, connectionId)))[0])
        .toMatchObject({ checkpoint: 'through-sign-flip', lastResult: 'needs_review', unresolvedConflictCount: 1 });
      expect(await ingestion.syncForUser(userId, connectionId, connector(signFlip)))
        .toMatchObject({ status: 'needs_review', conflictCount: 1 });
      expect(await ingestion.listPendingReviewForUser(userId)).toHaveLength(1);
    });
  });

  it('retains a confirmed income link on a same-direction bank correction', async () => {
    await withConnection(async ({ tx, userId, connectionId, ingestion }) => {
      await ingestion.syncForUser(userId, connectionId, connector(initialPage));
      const [checking] = await tx.select().from(schema.account).where(eq(schema.account.externalId, 'checking-1'));
      const [salary] = await tx.select().from(schema.transaction).where(and(
        eq(schema.transaction.accountId, checking.id), eq(schema.transaction.externalId, 'salary-1'),
      ));
      await tx.update(schema.transaction).set({ userInternalOverride: false, isInternalMovement: false })
        .where(eq(schema.transaction.id, salary.id));
      const [source] = await tx.insert(schema.incomeSource).values({
        userId, name: 'Salary', currency: 'CLP', regularity: 'irregular', amountKind: 'variable',
        schedule: null, startDate: '2026-01-01',
      }).returning();
      await new IncomeService(new IncomeRepository(tx)).confirmReceiptForUser(userId, salary.id, { sourceId: source.id });
      const correction = {
        ...initialPage, observedAt: '2026-10-17T18:00:00.000Z', checkpoint: 'salary-corrected',
        accounts: [], movements: [{ ...initialPage.movements[0], amount: '480.00',
          booked: { precision: 'calendar_day' as const, on: '2026-10-11', timeZone: 'America/Santiago' as const } }],
      };
      expect(await ingestion.syncForUser(userId, connectionId, connector(correction)))
        .toMatchObject({ status: 'complete', conflictCount: 0 });
      expect((await tx.select().from(schema.transaction).where(eq(schema.transaction.id, salary.id)))[0])
        .toMatchObject({ amount: '480.00', bookedOn: '2026-10-11', reviewStatus: 'clear' });
      expect(await new TransactionRepository(tx).sumByMonthForUser(userId, '2026-10'))
        .toMatchObject({ receivedIncome: '480.00' });
      expect((await tx.select().from(schema.incomeReceipt)
        .where(eq(schema.incomeReceipt.transactionId, salary.id)))[0].sourceId).toBe(source.id);
    });
  });

  it('keeps a provider removal across replays and before the corresponding account is imported', async () => {
    await withConnection(async ({ tx, userId, connectionId, ingestion }) => {
      await ingestion.syncForUser(userId, connectionId, connector(initialPage));
      expect((await ingestion.syncForUser(userId, connectionId, connector(removalPage))).status).toBe('complete');
      expect((await ingestion.syncForUser(userId, connectionId, connector({
        ...initialPage, observedAt: '2026-10-20T18:00:00.000Z', checkpoint: 'after-removal-replay',
      }))).status).toBe('complete');
      const [checking] = await tx.select().from(schema.account).where(eq(schema.account.externalId, 'checking-1'));
      const [grocery] = await tx.select().from(schema.transaction).where(and(
        eq(schema.transaction.accountId, checking.id), eq(schema.transaction.externalId, 'grocery-1'),
      ));
      expect(grocery).toMatchObject({ removalReason: 'reversed', amount: '-100.00' });
      expect(await new TransactionRepository(tx).sumByMonthForUser(userId, '2026-10'))
        .toMatchObject({ spending: '100.00' });

      const beforeAccount = {
        ...initialPage, observedAt: '2026-10-21T18:00:00.000Z',
        accounts: [], movements: [], checkpoint: 'removal-before-account',
        removedMovements: [{ accountExternalId: 'later-account', externalId: 'withdrawn',
          reason: 'removed' as const, providerUpdatedAt: null }],
      };
      await ingestion.syncForUser(userId, connectionId, connector(beforeAccount));
      const afterAccount = {
        ...initialPage, observedAt: '2026-10-22T18:00:00.000Z',
        accounts: [{ ...initialPage.accounts[0], externalId: 'later-account' }],
        movements: [{ ...initialPage.movements[1], accountExternalId: 'later-account', externalId: 'withdrawn' }],
        checkpoint: 'later-account-import',
      };
      await ingestion.syncForUser(userId, connectionId, connector(afterAccount));
      const [later] = await tx.select().from(schema.account).where(eq(schema.account.externalId, 'later-account'));
      expect(await tx.select().from(schema.transaction).where(and(
        eq(schema.transaction.accountId, later.id), eq(schema.transaction.externalId, 'withdrawn'),
      ))).toEqual([]);
      expect(await tx.select().from(schema.providerMovementRemoval).where(and(
        eq(schema.providerMovementRemoval.providerConnectionId, connectionId),
        eq(schema.providerMovementRemoval.movementExternalId, 'withdrawn'),
      ))).toHaveLength(1);
    });
  });

  it('does not apply partial pages or advance a checkpoint on provider failure', async () => {
    await withConnection(async ({ tx, userId, otherUserId, connectionId, otherConnectionId, ingestion }) => {
      const calls = vi.fn(async ({ pageCursor }: { pageCursor: string | null }) => pageCursor === null
        ? { ...initialPage, complete: false, nextCursor: 'page-2', checkpoint: null }
        : retryableFailure);
      const paged: BankingConnector = { provider: 'fixture-bank', fetchPage: calls };
      expect(await ingestion.syncForUser(userId, connectionId, paged))
        .toMatchObject({ status: 'failed', reason: 'retryable' });
      expect(calls).toHaveBeenCalledTimes(2);
      expect(await tx.select().from(schema.account).where(eq(schema.account.providerConnectionId, connectionId)))
        .toEqual([]);
      const [state] = await tx.select().from(schema.providerSyncState)
        .where(eq(schema.providerSyncState.providerConnectionId, connectionId));
      expect(state).toMatchObject({ checkpoint: null, lastFailureReason: 'retryable', lastSuccessAt: null });
      const wrongUser = vi.fn(async () => initialPage);
      await expect(ingestion.syncForUser(otherUserId, connectionId, {
        provider: 'fixture-bank', fetchPage: wrongUser,
      })).rejects.toThrow('Banking connection not found');
      expect(wrongUser).not.toHaveBeenCalled();
      await expect(ingestion.syncForUser(userId, otherConnectionId, connector(initialPage)))
        .rejects.toThrow('Banking connection not found');
      expect((await ingestion.syncForUser(userId, connectionId, connector(unknownBalancePage))).status)
        .toBe('complete');
      expect((await tx.select().from(schema.account).where(eq(schema.account.externalId, 'checking-1')))[0])
        .toMatchObject({ balance: null, historyCompleteness: 'unknown' });
      expect(await ingestion.syncForUser(userId, connectionId, connector(expiredFailure)))
        .toMatchObject({ status: 'failed', reason: 'expired' });
      expect((await tx.select().from(schema.providerConnection)
        .where(eq(schema.providerConnection.id, connectionId)))[0].status).toBe('expired');
    });
  });

  it('verifies every page before writing and scopes reused external IDs to their connection', async () => {
    await withConnection(async ({ tx, userId, otherUserId, connectionId, otherConnectionId, ingestion }) => {
      const paged: BankingConnector = {
        provider: 'fixture-bank',
        fetchPage: vi.fn(async ({ checkpoint, pageCursor }) => {
          expect(checkpoint).toBeNull();
          return pageCursor === null
            ? { ...initialPage, complete: false, nextCursor: 'second-page', checkpoint: null,
              accounts: initialPage.accounts.slice(0, 1), movements: initialPage.movements.slice(0, 3) }
            : { ...initialPage, accounts: initialPage.accounts.slice(1), movements: initialPage.movements.slice(3) };
        }),
      };
      expect((await ingestion.syncForUser(userId, connectionId, paged)).status).toBe('complete');
      const movementsFor = (ownerId: string) => tx.select({ id: schema.transaction.id }).from(schema.transaction)
        .innerJoin(schema.account, eq(schema.account.id, schema.transaction.accountId))
        .where(eq(schema.account.userId, ownerId));
      expect(await movementsFor(userId)).toHaveLength(initialPage.movements.length);
      expect((await ingestion.syncForUser(otherUserId, otherConnectionId, connector(initialPage))).status).toBe('complete');
      expect(await movementsFor(otherUserId)).toHaveLength(initialPage.movements.length);
      expect(await new AccountRepository(tx).listActiveForUser(userId)).toHaveLength(3);
      expect(await new AccountRepository(tx).listActiveForUser(otherUserId)).toHaveLength(3);

      const firstAccounts = await tx.select().from(schema.account)
        .where(eq(schema.account.providerConnectionId, connectionId));
      const otherAccounts = await tx.select().from(schema.account)
        .where(eq(schema.account.providerConnectionId, otherConnectionId));
      expect(firstAccounts.find((row) => row.externalId === 'checking-1')?.id)
        .not.toBe(otherAccounts.find((row) => row.externalId === 'checking-1')?.id);
    });
  });

  it('marks contradicted user decisions for review without treating a merchant hint as hard evidence', async () => {
    await withConnection(async ({ tx, userId, connectionId, ingestion }) => {
      await ingestion.syncForUser(userId, connectionId, connector(initialPage));
      const [checking] = await tx.select().from(schema.account).where(eq(schema.account.externalId, 'checking-1'));
      const [transfer] = await tx.select().from(schema.transaction).where(and(
        eq(schema.transaction.accountId, checking.id), eq(schema.transaction.externalId, 'transfer-leg'),
      ));
      const [grocery] = await tx.select().from(schema.transaction).where(and(
        eq(schema.transaction.accountId, checking.id), eq(schema.transaction.externalId, 'grocery-1'),
      ));
      await tx.update(schema.transaction).set({ userInternalOverride: false, isInternalMovement: false })
        .where(eq(schema.transaction.id, transfer.id));
      await tx.update(schema.transaction).set({ userInternalOverride: true, isInternalMovement: true })
        .where(eq(schema.transaction.id, grocery.id));

      expect(await ingestion.syncForUser(userId, connectionId, connector(initialPage)))
        .toMatchObject({ status: 'needs_review', conflictCount: 1 });
      const [transferAfter] = await tx.select().from(schema.transaction).where(eq(schema.transaction.id, transfer.id));
      const [groceryAfter] = await tx.select().from(schema.transaction).where(eq(schema.transaction.id, grocery.id));
      expect(transferAfter).toMatchObject({ userInternalOverride: false, reviewStatus: 'needs_review' });
      expect(groceryAfter).toMatchObject({ userInternalOverride: true, reviewStatus: 'clear' });
      expect(await ingestion.listPendingReviewForUser(userId)).toMatchObject([{
        transactionId: transfer.id, reason: 'internal_override_disagrees',
      }]);
      expect(await new TransactionRepository(tx).sumByMonthForUser(userId, '2026-10'))
        .toMatchObject({ spending: '100.00', unresolvedMovementCount: 2 }); // transfer conflict + salary credit
    });
  });

  it('retains a confirmed receipt on bank removal but suspends its active interpretation', async () => {
    await withConnection(async ({ tx, userId, connectionId, ingestion }) => {
      await ingestion.syncForUser(userId, connectionId, connector(initialPage));
      const [checking] = await tx.select().from(schema.account).where(eq(schema.account.externalId, 'checking-1'));
      const [salary] = await tx.select().from(schema.transaction).where(and(
        eq(schema.transaction.accountId, checking.id), eq(schema.transaction.externalId, 'salary-1'),
      ));
      await tx.update(schema.transaction).set({ isInternalMovement: false, userInternalOverride: false })
        .where(eq(schema.transaction.id, salary.id));
      const [source] = await tx.insert(schema.incomeSource).values({
        userId, name: 'Salary', currency: 'CLP', regularity: 'irregular', amountKind: 'variable',
        schedule: null, startDate: '2026-01-01',
      }).returning();
      await new IncomeService(new IncomeRepository(tx)).confirmReceiptForUser(userId, salary.id, { sourceId: source.id });
      const removal = { ...removalPage, removedMovements: [{ ...removalPage.removedMovements[0], externalId: 'salary-1' }] };
      expect(await ingestion.syncForUser(userId, connectionId, connector(removal)))
        .toMatchObject({ status: 'needs_review', conflictCount: 1 });
      expect((await tx.select().from(schema.transaction).where(eq(schema.transaction.id, salary.id)))[0])
        .toMatchObject({ removalReason: 'reversed', reviewStatus: 'needs_review' });
      expect(await tx.select().from(schema.incomeReceipt).where(eq(schema.incomeReceipt.transactionId, salary.id)))
        .toHaveLength(1);
      expect(await new TransactionRepository(tx).sumByMonthForUser(userId, '2026-10'))
        .toMatchObject({ receivedIncome: '0.00' });
    });
  });

  it('does not overwrite a completed run with a stale concurrent sync', async () => {
    await withConnection(async ({ tx, userId, connectionId, ingestion }) => {
      const raced: BankingConnector = {
        provider: 'fixture-bank',
        fetchPage: vi.fn(async () => {
          await tx.update(schema.providerSyncState).set({ checkpoint: 'newer-run', revision: 1 })
            .where(eq(schema.providerSyncState.providerConnectionId, connectionId));
          return initialPage;
        }),
      };
      expect(await ingestion.syncForUser(userId, connectionId, raced)).toEqual({ status: 'superseded' });
      expect(await tx.select().from(schema.account).where(eq(schema.account.providerConnectionId, connectionId)))
        .toEqual([]);
      expect((await tx.select().from(schema.providerSyncState)
        .where(eq(schema.providerSyncState.providerConnectionId, connectionId)))[0]?.checkpoint).toBe('newer-run');
    });
  });

  it('rolls back even account snapshots if another movement in the same run is invalid', async () => {
    await withConnection(async ({ tx, userId, connectionId, ingestion }) => {
      const invalid = {
        ...initialPage, movements: [{ ...initialPage.movements[1], accountExternalId: 'unknown-account' }],
      };
      expect(await ingestion.syncForUser(userId, connectionId, connector(invalid)))
        .toMatchObject({ status: 'failed', reason: 'invalid_data' });
      expect(await tx.select().from(schema.account).where(eq(schema.account.providerConnectionId, connectionId)))
        .toEqual([]);
      expect((await tx.select().from(schema.providerSyncState)
        .where(eq(schema.providerSyncState.providerConnectionId, connectionId)))[0])
        .toMatchObject({ checkpoint: null, revision: 0, lastFailureReason: 'invalid_data' });
    });
  });

  it('retains a previously verified internal pair when one unchanged leg is replayed', async () => {
    await withConnection(async ({ tx, userId, connectionId, ingestion }) => {
      await ingestion.syncForUser(userId, connectionId, connector(initialPage));
      const partial = {
        ...initialPage, observedAt: '2026-10-17T18:00:00.000Z', checkpoint: 'one-leg-only',
        accounts: [], movements: [initialPage.movements[2]],
      };
      expect((await ingestion.syncForUser(userId, connectionId, connector(partial))).status).toBe('complete');
      const [checking] = await tx.select().from(schema.account).where(eq(schema.account.externalId, 'checking-1'));
      const [transfer] = await tx.select().from(schema.transaction).where(and(
        eq(schema.transaction.accountId, checking.id), eq(schema.transaction.externalId, 'transfer-leg'),
      ));
      expect(transfer).toMatchObject({ isInternalMovement: true, providerInternalAssessment: 'internal' });
      expect(await new TransactionRepository(tx).sumByMonthForUser(userId, '2026-10'))
        .toMatchObject({ spending: '200.00' });
    });
  });
});
