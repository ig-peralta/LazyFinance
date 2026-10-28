import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MCP_STRATEGY, type McpStrategy } from '@rekog/mcp-nest';
import { eq, sql } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import { DRIZZLE_PG_CLIENT } from '../drizzle/drizzle.tokens';
import * as schema from '../drizzle/schema';
import { migrateTestDatabase } from '../drizzle/test-migrations';
import { SummariesService } from '../summaries/summaries.service';
import { IncomeService } from './income.service';

type Database = PostgresJsDatabase<typeof schema>;
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
type Context = {
  app: INestApplication;
  tx: Transaction;
  token: string;
  otherToken: string;
  userId: string;
  accountId: string;
  salaryId: string;
  refundId: string;
  internalId: string;
  debitId: string;
  futureId: string;
  otherTransactionId: string;
};

const sourceInput = (changes = {}) => ({
  name: 'Trabajo principal', currency: 'CLP', regularity: 'regular', amountKind: 'fixed',
  expectedAmount: '1500000.00', schedule: { frequency: 'monthly', day: 25 },
  startDate: '2026-01-01', endDate: null, ...changes,
});

function http(context: Context, method: 'get' | 'post' | 'put' | 'delete', path: string, body?: object, token = context.token) {
  return request(context.app.getHttpServer())[method](path).set('Authorization', `Bearer ${token}`).send(body);
}

describe.skipIf(!process.env.TEST_POSTGRES_URL)('Income backend against PostgreSQL', () => {
  let client: ReturnType<typeof postgres>;
  let db: Database;

  beforeAll(async () => {
    client = postgres(process.env.TEST_POSTGRES_URL!, { max: 1 });
    db = drizzle(client, { schema });
    await migrateTestDatabase(db, process.env.TEST_POSTGRES_URL!);
  });

  afterAll(async () => client?.end());

  async function withApi(work: (context: Context) => Promise<void>, startMcp = false) {
    const rollback = new Error('Rollback integration fixtures');
    await db.transaction(async (tx) => {
      const userId = randomUUID();
      const otherUserId = randomUUID();
      const token = randomUUID();
      const otherToken = randomUUID();
      await tx.insert(schema.user).values([
        { id: userId, name: 'Income test', email: `${userId}@test.local`, apiToken: token },
        { id: otherUserId, name: 'Other user', email: `${otherUserId}@test.local`, apiToken: otherToken },
      ]);
      await tx.insert(schema.provider).values({ identifier: 'manual' }).onConflictDoNothing();
      const [provider] = await tx.select().from(schema.provider).where(eq(schema.provider.identifier, 'manual'));
      const connectionId = randomUUID();
      const otherConnectionId = randomUUID();
      await tx.insert(schema.providerConnection).values([
        { id: connectionId, userId, providerId: provider.id, mode: 'test' },
        { id: otherConnectionId, userId: otherUserId, providerId: provider.id, mode: 'test' },
      ]);
      const accountId = randomUUID();
      const otherAccountId = randomUUID();
      await tx.insert(schema.account).values([
        { id: accountId, userId, providerConnectionId: connectionId, type: 'checking', number: 'INCOME-1', holderName: 'Income test', balance: '500000.00' },
        { id: otherAccountId, userId: otherUserId, providerConnectionId: otherConnectionId, type: 'checking', number: 'INCOME-2', holderName: 'Other user', balance: '999000.00' },
      ]);
      const salaryId = randomUUID();
      const refundId = randomUUID();
      const internalId = randomUUID();
      const debitId = randomUUID();
      const futureId = randomUUID();
      const otherTransactionId = randomUUID();
      const movement = (id: string, amount: string, date: string, internal = false, account = accountId) => ({
        id, amount, bookedAt: new Date(date), accountId: account,
        type: Number(amount) > 0 ? 'credit' as const : 'debit' as const,
        source: 'manual' as const, isInternalMovement: internal,
      });
      await tx.insert(schema.transaction).values([
        movement(salaryId, '1480000.00', '2026-09-26T15:00:00Z'),
        movement(refundId, '20000.00', '2026-09-27T15:00:00Z'),
        movement(internalId, '50000.00', '2026-09-28T15:00:00Z', true),
        movement(debitId, '-100000.00', '2026-09-20T15:00:00Z'),
        movement(futureId, '300000.00', '2099-01-01T15:00:00Z'),
        movement(otherTransactionId, '999000.00', '2026-09-26T15:00:00Z', false, otherAccountId),
      ]);

      const module = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(DRIZZLE_PG_CLIENT).useValue(tx).compile();
      const app = module.createNestApplication({ logger: false });
      try {
        if (startMcp) {
          const strategy = app.get<McpStrategy>(MCP_STRATEGY);
          strategy.setHttpAdapter(app.getHttpAdapter());
          app.connectMicroservice({ strategy });
          await app.startAllMicroservices();
        }
        await app.init();
        await work({ app, tx, token, otherToken, userId, accountId, salaryId, refundId, internalId, debitId, futureId, otherTransactionId });
      } finally {
        await app.close();
      }
      throw rollback;
    }).catch((error) => { if (error !== rollback) throw error; });
  }

  it('validates declarations, supports updates and archiving, and never changes bank facts', async () => {
    await withApi(async (context) => {
      await request(context.app.getHttpServer()).post('/income/sources').send(sourceInput()).expect(401);
      await http(context, 'post', '/income/sources', sourceInput({ schedule: null })).expect(400);
      await http(context, 'post', '/income/sources', { ...sourceInput(), userId: randomUUID() }).expect(400);
      const before = await context.tx.select().from(schema.transaction).where(eq(schema.transaction.accountId, context.accountId));
      const created = await http(context, 'post', '/income/sources', sourceInput()).expect(201);
      const sourceId = created.body.id;
      expect(created.body).not.toHaveProperty('userId');
      expect(created.body.schedule).toEqual({ frequency: 'monthly', day: 25 });
      const expected = await http(context, 'get', '/income/expected?month=2026-09').expect(200);
      expect(expected.headers['cache-control']).toBe('private, no-store');
      expect(expected.body.totals).toMatchObject({ amount: '1500000.00', paymentCount: 1 });
      const beforeReceipt = await http(context, 'get', '/income/summary?month=2026-09').expect(200);
      expect(beforeReceipt.body.receivedIncome).toBe('0.00');
      expect(beforeReceipt.body.unclassifiedCredits).toEqual({ amount: '1500000.00', count: 2 });

      await http(context, 'put', `/income/receipts/${context.salaryId}`, { sourceId }).expect(200);
      await http(context, 'put', `/income/sources/${sourceId}`, sourceInput({
        amountKind: 'variable', expectedAmount: '1700000.00',
      })).expect(200);
      const updated = await http(context, 'get', '/income/summary?month=2026-09').expect(200);
      expect(updated.body.expectedIncome).toMatchObject({ amount: '1700000.00', estimatedAmount: '1700000.00' });
      expect(updated.body.receivedIncome).toBe('1480000.00');
      expect(updated.body.receipts[0]).toMatchObject({ transactionId: context.salaryId, amount: '1480000.00', bookedAt: '2026-09-26T15:00:00.000Z' });
      expect(updated.body.expectedPayments[0].date).toBe('2026-09-25');
      expect(await context.tx.select().from(schema.transaction).where(eq(schema.transaction.accountId, context.accountId))).toEqual(before);
      const [account] = await context.tx.select().from(schema.account).where(eq(schema.account.id, context.accountId));
      expect(account.balance).toBe('500000.00');

      const archived = await http(context, 'post', `/income/sources/${sourceId}/archive`).expect(200);
      expect(archived.body.archivedAt).not.toBeNull();
      const repeated = await http(context, 'post', `/income/sources/${sourceId}/archive`).expect(200);
      expect(repeated.body.archivedAt).toBe(archived.body.archivedAt);
      await http(context, 'put', `/income/sources/${sourceId}`, sourceInput()).expect(400);
      const future = await http(context, 'get', '/income/summary?month=2099-02').expect(200);
      expect(future.body.expectedIncome.paymentCount).toBe(0);
      expect(future.body.receivedIncome).toBe('0.00');
      const history = await http(context, 'get', '/income/receipts?month=2026-09').expect(200);
      expect(history.body).toHaveLength(1);
      expect(history.body[0].amount).toBe('1480000.00');
    });
  });

  it('supports explicit irregular expectations and keeps unknown regular amounts visible', async () => {
    await withApi(async (context) => {
      const irregular = await http(context, 'post', '/income/sources', sourceInput({
        name: 'Freelance', regularity: 'irregular', amountKind: 'variable', expectedAmount: null, schedule: null,
      })).expect(201);
      const sourceId = irregular.body.id;
      const noProjection = await http(context, 'get', '/income/expected?month=2026-09').expect(200);
      expect(noProjection.body.payments).toEqual([]);
      await http(context, 'post', `/income/sources/${sourceId}/expectations`, { date: '2025-12-01', amount: '100.00' }).expect(400);
      const expectation = await http(context, 'post', `/income/sources/${sourceId}/expectations`, {
        date: '2026-09-20', amount: '250000.00', isEstimate: true,
      }).expect(201);
      await http(context, 'put', `/income/expectations/${expectation.body.id}`, {
        date: '2026-09-21', amount: '270000.00', isEstimate: false,
      }).expect(200);
      const expected = await http(context, 'get', '/income/expected?month=2026-09').expect(200);
      expect(expected.body.totals).toEqual({ amount: '270000.00', estimatedAmount: '0.00', paymentCount: 1, unknownAmountCount: 0 });
      expect(expected.body.payments[0]).toMatchObject({ date: '2026-09-21', expectationId: expectation.body.id });
      await http(context, 'put', `/income/sources/${sourceId}`, sourceInput()).expect(400);
      await http(context, 'delete', `/income/expectations/${expectation.body.id}`).expect(204);
      await http(context, 'put', `/income/sources/${sourceId}`, sourceInput({ amountKind: 'variable', expectedAmount: null })).expect(200);
      const unknown = await http(context, 'get', '/income/expected?month=2026-09').expect(200);
      expect(unknown.body.totals).toMatchObject({ amount: '0.00', paymentCount: 1, unknownAmountCount: 1 });
      expect(unknown.body.payments[0]).toMatchObject({ amount: null, amountType: 'unknown' });
      await http(context, 'post', `/income/sources/${sourceId}/expectations`, { date: '2026-09-21', amount: '1.00' }).expect(400);
      await http(context, 'get', '/income/expected?month=2026-13').expect(400);
      await http(context, 'get', '/income/expected?month=2026-09&month=2026-10').expect(400);
    });
  });

  it('counts confirmed income once, excludes refunds/transfers, and agrees through HTTP and MCP', async () => {
    await withApi(async (context) => {
      const created = await http(context, 'post', '/income/sources', sourceInput()).expect(201);
      const sourceId = created.body.id;
      const first = await http(context, 'put', `/income/receipts/${context.salaryId}`, { sourceId }).expect(200);
      const again = await http(context, 'put', `/income/receipts/${context.salaryId}`, { sourceId }).expect(200);
      expect(again.body).toEqual(first.body);
      for (const id of [context.internalId, context.debitId, context.futureId]) {
        await http(context, 'put', `/income/receipts/${id}`, { sourceId }).expect(400);
      }
      const summary = await http(context, 'get', '/income/summary?month=2026-09').expect(200);
      expect(summary.body.receivedIncome).toBe('1480000.00');
      expect(summary.body.expectedIncome.amount).toBe('1500000.00');
      expect(summary.body.unclassifiedCredits).toEqual({ amount: '20000.00', count: 1 });
      expect(summary.body.receipts).toHaveLength(1);
      const financial = await http(context, 'get', '/summaries/monthly?month=2026-09').expect(200);
      expect(financial.body).toMatchObject({
        receivedIncome: summary.body.receivedIncome, expectedIncome: summary.body.expectedIncome,
        unclassifiedCredits: summary.body.unclassifiedCredits, spending: '100000.00',
      });
      expect(financial.body).not.toHaveProperty('income');
      const mcp = await request(context.app.getHttpServer()).post('/mcp')
        .set('Authorization', `Bearer ${context.token}`).set('Accept', 'application/json, text/event-stream')
        .send({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'consultar_ingresos', arguments: { month: '2026-09' } } }).expect(200);
      expect(mcp.body.result.isError).not.toBe(true);
      expect(mcp.body.result.structuredContent).toMatchObject({
        receivedIncome: summary.body.receivedIncome, expectedIncome: summary.body.expectedIncome,
        unclassifiedCredits: summary.body.unclassifiedCredits, receipts: summary.body.receipts,
      });
      await http(context, 'delete', `/income/receipts/${context.salaryId}`).expect(204);
      const cleared = await http(context, 'get', '/income/summary?month=2026-09').expect(200);
      expect(cleared.body.receivedIncome).toBe('0.00');
      expect(cleared.body.unclassifiedCredits).toEqual({ amount: '1500000.00', count: 2 });
    }, true);
  });

  it('isolates sources, expectations, receipts and malformed cross-user links', async () => {
    await withApi(async (context) => {
      const own = await http(context, 'post', '/income/sources', sourceInput()).expect(201);
      const other = await http(context, 'post', '/income/sources', sourceInput({
        regularity: 'irregular', amountKind: 'variable', expectedAmount: null, schedule: null,
      }), context.otherToken).expect(201);
      const otherExpectation = await http(context, 'post', `/income/sources/${other.body.id}/expectations`, {
        date: '2026-09-21', amount: '2000.00',
      }, context.otherToken).expect(201);
      const ownList = await http(context, 'get', '/income/sources').expect(200);
      expect(ownList.body.map(({ id }: { id: string }) => id)).toEqual([own.body.id]);
      await http(context, 'get', `/income/sources/${other.body.id}`).expect(404);
      await http(context, 'put', `/income/sources/${other.body.id}`, sourceInput()).expect(404);
      await http(context, 'post', `/income/sources/${other.body.id}/archive`).expect(404);
      await http(context, 'get', `/income/sources/${other.body.id}/expectations`).expect(404);
      await http(context, 'post', `/income/sources/${other.body.id}/expectations`, { date: '2026-09-21', amount: '1.00' }).expect(404);
      await http(context, 'put', `/income/expectations/${otherExpectation.body.id}`, { date: '2026-09-21', amount: '1.00' }).expect(404);
      await http(context, 'delete', `/income/expectations/${otherExpectation.body.id}`).expect(404);
      await http(context, 'put', `/income/receipts/${context.salaryId}`, { sourceId: other.body.id }).expect(404);
      await http(context, 'put', `/income/receipts/${context.otherTransactionId}`, { sourceId: own.body.id }).expect(404);
      await http(context, 'delete', `/income/receipts/${context.otherTransactionId}`).expect(404);

      await context.tx.insert(schema.incomeReceipt).values({ transactionId: context.salaryId, sourceId: other.body.id });
      const ownSummary = await http(context, 'get', '/income/summary?month=2026-09').expect(200);
      const otherSummary = await http(context, 'get', '/income/summary?month=2026-09', undefined, context.otherToken).expect(200);
      expect(ownSummary.body.receivedIncome).toBe('0.00');
      expect(otherSummary.body.receivedIncome).toBe('0.00');
      expect(ownSummary.body.receipts).toEqual([]);
      expect(otherSummary.body.receipts).toEqual([]);
      await http(context, 'put', `/income/receipts/${context.salaryId}`, { sourceId: own.body.id }).expect(200);
      expect((await context.tx.select().from(schema.incomeReceipt)).filter(({ transactionId }) => transactionId === context.salaryId)).toHaveLength(1);
    });
  });

  it('compares received income over equivalent observed periods while retaining the full-month plan', async () => {
    await withApi(async (context) => {
      const created = await http(context, 'post', '/income/sources', sourceInput()).expect(201);
      const sourceId = created.body.id;
      const income = context.app.get(IncomeService);
      for (const [amount, date] of [['400.00', '2026-09-10'], ['500.00', '2026-10-10'], ['900.00', '2026-10-20']]) {
        const id = randomUUID();
        await context.tx.insert(schema.transaction).values({ id, accountId: context.accountId, amount, type: 'credit', source: 'manual', bookedAt: new Date(`${date}T15:00:00Z`), isInternalMovement: false });
        await income.confirmReceiptForUser(context.userId, id, { sourceId }, new Date('2026-10-21T15:00:00Z'));
      }
      await income.confirmReceiptForUser(context.userId, context.salaryId, { sourceId });
      const summaries = context.app.get(SummariesService);
      const now = new Date('2026-10-16T15:00:00Z');
      const comparison = await summaries.getComparisonForUser(context.userId, '2026-10', now);
      expect(comparison.receivedIncome).toEqual({ current: '500.00', previous: '400.00', change: '100.00' });
      const summary = await summaries.getMonthlyForUser(context.userId, '2026-10', now);
      expect(summary.expectedIncome.amount).toBe('1500000.00');
      expect(summary.receivedIncome).toBe('500.00');
      expect((await context.tx.execute(sql`SELECT count(*)::int AS count FROM income_receipt WHERE source_id = ${sourceId}`))[0].count).toBe(4);
    });
  });
});
