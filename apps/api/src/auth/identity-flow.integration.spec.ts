import { randomUUID } from 'node:crypto';
import type { VerifiedExternalIdentity } from '@lazyfinance/contracts';
import { type INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { eq } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../app.module';
import { BankingIngestionService } from '../banking/ingestion/banking-ingestion.service';
import { DRIZZLE_PG_CLIENT } from '../drizzle/drizzle.tokens';
import * as schema from '../drizzle/schema';
import { migrateTestDatabase } from '../drizzle/test-migrations';
import { EnvironmentService } from '../environment/environment.service';
import { FirebaseAuthService } from './firebase/firebase-auth.service';
import { mockEmail, mockIdentity, mockToken } from './mock/mock-auth.constants';

type Database = PostgresJsDatabase<typeof schema>;
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
const projectId = 'lazyfinance-dev';
const tokenA = process.env.TEST_FIREBASE_ID_TOKEN_A;
const tokenB = process.env.TEST_FIREBASE_ID_TOKEN_B;

describe.skipIf(!process.env.TEST_POSTGRES_URL)('Firebase identity flow against PostgreSQL', () => {
  let client: ReturnType<typeof postgres>;
  let db: Database;

  beforeAll(async () => {
    client = postgres(process.env.TEST_POSTGRES_URL!, { max: 4 });
    db = drizzle(client, { schema });
    await migrateTestDatabase(db, process.env.TEST_POSTGRES_URL!);
  });

  afterAll(async () => client?.end());

  async function withApi(work: (app: INestApplication, tx: Transaction) => Promise<void>,
    verify?: (token: string) => Promise<VerifiedExternalIdentity>, provider: 'firebase' | 'mock' = 'firebase') {
    const rollback = new Error('Rollback identity flow fixtures');
    await db.transaction(async (tx) => {
      const builder = Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(DRIZZLE_PG_CLIENT).useValue(tx)
        .overrideProvider(EnvironmentService).useValue({
          get: (key: string) => key === 'AUTH_PROVIDER' ? provider
            : key === 'FIREBASE_PROJECT_ID' ? projectId : undefined,
        });
      if (verify) builder.overrideProvider(FirebaseAuthService).useValue({ verify });
      const module = await builder.compile();
      const app = module.createNestApplication({ logger: false });
      try {
        await app.init();
        await work(app, tx);
      } finally {
        await app.close();
      }
      throw rollback;
    }).catch((error) => { if (error !== rollback) throw error; });
  }

  async function checkOwnedFinancialFlow(app: INestApplication, tx: Transaction, firstToken: string, secondToken: string) {
    const api = (token: string) => ({
      get: (path: string) => request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${token}`),
      post: (path: string, body: object) => request(app.getHttpServer()).post(path).set('Authorization', `Bearer ${token}`).send(body),
      put: (path: string, body: object) => request(app.getHttpServer()).put(path).set('Authorization', `Bearer ${token}`).send(body),
      delete: (path: string) => request(app.getHttpServer()).delete(path).set('Authorization', `Bearer ${token}`),
    });
    const first = api(firstToken);
    const second = api(secondToken);
    const firstPrincipal = (await first.get('/auth/principal').expect(200)).body;
    const secondPrincipal = (await second.get('/auth/principal').expect(200)).body;
    expect(firstPrincipal.userId).not.toBe(secondPrincipal.userId);
    expect((await first.get('/auth/principal').expect(200)).body).toEqual(firstPrincipal);
    expect((await second.get('/auth/principal').expect(200)).body).toEqual(secondPrincipal);
    for (const principal of [firstPrincipal, secondPrincipal]) {
      expect(await tx.select().from(schema.externalIdentity)
        .where(eq(schema.externalIdentity.userId, principal.userId)))
        .toEqual(expect.arrayContaining([expect.objectContaining({
          provider: 'firebase', issuer: `https://securetoken.google.com/${projectId}`,
        })]));
    }

    const [provider] = await tx.insert(schema.provider).values({ identifier: `laz45-${randomUUID()}` })
      .returning({ id: schema.provider.id });
    const connectionA = randomUUID();
    const connectionB = randomUUID();
    await tx.insert(schema.providerConnection).values([
      { id: connectionA, userId: firstPrincipal.userId, providerId: provider.id, mode: 'test' },
      { id: connectionB, userId: secondPrincipal.userId, providerId: provider.id, mode: 'test' },
    ]);
    const accountA = randomUUID();
    const accountB = randomUUID();
    await tx.insert(schema.account).values([
      { id: accountA, userId: firstPrincipal.userId, providerConnectionId: connectionA, type: 'checking', balance: '100.00' },
      { id: accountB, userId: secondPrincipal.userId, providerConnectionId: connectionB, type: 'checking', balance: '200.00' },
    ]);
    const transactionA = randomUUID();
    const transactionB = randomUUID();
    await tx.insert(schema.transaction).values([
      { id: transactionA, accountId: accountA, type: 'credit', amount: '50.00', bookedAt: new Date('2026-10-15T12:00:00Z'), source: 'manual', isInternalMovement: false },
      { id: transactionB, accountId: accountB, type: 'credit', amount: '80.00', bookedAt: new Date('2026-10-15T12:00:00Z'), source: 'manual', isInternalMovement: false },
    ]);
    const objectiveA = randomUUID();
    const objectiveB = randomUUID();
    await tx.insert(schema.objective).values([
      { id: objectiveA, userId: firstPrincipal.userId, name: 'First savings', amount: '100.00', intent: 'saving', kind: 'amount_based' },
      { id: objectiveB, userId: secondPrincipal.userId, name: 'Second savings', amount: '200.00', intent: 'saving', kind: 'amount_based' },
    ]);

    const fetchPage = vi.fn();
    await expect(app.get(BankingIngestionService).syncForUser(secondPrincipal.userId, connectionA, {
      provider: 'fixture-bank', fetchPage,
    })).rejects.toMatchObject({ status: 404 });
    expect(fetchPage).not.toHaveBeenCalled();

    expect((await first.get('/accounts').expect(200)).body.map(({ id }: { id: string }) => id)).toContain(accountA);
    expect((await first.get('/accounts').expect(200)).body.map(({ id }: { id: string }) => id)).not.toContain(accountB);
    expect((await second.get('/accounts').expect(200)).body.map(({ id }: { id: string }) => id)).toContain(accountB);
    expect((await second.get('/accounts').expect(200)).body.map(({ id }: { id: string }) => id)).not.toContain(accountA);
    await first.get(`/transactions/${transactionA}/tag-suggestions`).expect(200);
    await second.get(`/transactions/${transactionA}/tag-suggestions`).expect(404);
    expect((await first.get('/transactions/recent').expect(200)).body.map(({ id }: { id: string }) => id)).not.toContain(transactionB);
    expect((await second.get('/transactions/recent').expect(200)).body.map(({ id }: { id: string }) => id)).not.toContain(transactionA);
    const firstTag = (await first.post('/tags', { name: `LAZ-45 ${randomUUID()}` }).expect(201)).body.id as string;
    await second.put(`/transactions/${transactionA}/tag`, { tagId: firstTag }).expect(404);
    await first.put(`/transactions/${transactionB}/tag`, { tagId: firstTag }).expect(404);
    expect((await tx.select().from(schema.transaction).where(eq(schema.transaction.id, transactionA)))[0].tagId).toBeNull();
    expect((await first.get('/objectives').expect(200)).body.map(({ id }: { id: string }) => id)).toContain(objectiveA);
    expect((await first.get('/objectives').expect(200)).body.map(({ id }: { id: string }) => id)).not.toContain(objectiveB);
    expect((await second.get('/objectives').expect(200)).body.map(({ id }: { id: string }) => id)).toContain(objectiveB);

    const source = (name: string) => ({
      name, currency: 'CLP', regularity: 'irregular', amountKind: 'variable', expectedAmount: null,
      schedule: null, startDate: '2026-01-01', endDate: null,
    });
    const beforeFirstIncome = (await first.get('/income/summary?month=2026-10').expect(200)).body.receivedIncome;
    const beforeSecondIncome = (await second.get('/income/summary?month=2026-10').expect(200)).body.receivedIncome;
    const sourceA = (await first.post('/income/sources', source('First income')).expect(201)).body.id as string;
    const sourceB = (await second.post('/income/sources', source('Second income')).expect(201)).body.id as string;
    const expectationA = (await first.post(`/income/sources/${sourceA}/expectations`, {
      date: '2026-10-15', amount: '50.00',
    }).expect(201)).body.id as string;
    await first.put(`/income/receipts/${transactionA}`, { sourceId: sourceA }).expect(200);
    await second.put(`/income/receipts/${transactionB}`, { sourceId: sourceB }).expect(200);

    expect((await first.get('/income/sources').expect(200)).body.map(({ id }: { id: string }) => id)).toContain(sourceA);
    expect((await first.get('/income/sources').expect(200)).body.map(({ id }: { id: string }) => id)).not.toContain(sourceB);
    expect((await second.get('/income/sources').expect(200)).body.map(({ id }: { id: string }) => id)).not.toContain(sourceA);
    await second.get(`/income/sources/${sourceA}`).expect(404);
    await second.put(`/income/sources/${sourceA}`, source('Stolen income')).expect(404);
    await second.post(`/income/sources/${sourceA}/expectations`, { date: '2026-10-16', amount: '1.00' }).expect(404);
    await second.put(`/income/expectations/${expectationA}`, { date: '2026-10-16', amount: '1.00' }).expect(404);
    await second.delete(`/income/expectations/${expectationA}`).expect(404);
    await second.put(`/income/receipts/${transactionA}`, { sourceId: sourceB }).expect(404);
    await second.delete(`/income/receipts/${transactionA}`).expect(404);
    await first.put(`/income/receipts/${transactionA}`, { sourceId: sourceB }).expect(404);
    const firstReceipts = (await first.get('/income/receipts?month=2026-10').expect(200)).body
      .map(({ transactionId }: { transactionId: string }) => transactionId);
    const secondReceipts = (await second.get('/income/receipts?month=2026-10').expect(200)).body
      .map(({ transactionId }: { transactionId: string }) => transactionId);
    expect(firstReceipts).toContain(transactionA);
    expect(firstReceipts).not.toContain(transactionB);
    expect(secondReceipts).toContain(transactionB);
    expect(secondReceipts).not.toContain(transactionA);
    expect(Number((await first.get('/income/summary?month=2026-10').expect(200)).body.receivedIncome)
      - Number(beforeFirstIncome)).toBe(50);
    expect(Number((await second.get('/income/summary?month=2026-10').expect(200)).body.receivedIncome)
      - Number(beforeSecondIncome)).toBe(80);
    expect((await first.get(`/income/sources/${sourceA}/expectations`).expect(200)).body
      .map(({ id }: { id: string }) => id)).toContain(expectationA);
    expect((await tx.select().from(schema.incomeReceipt).where(eq(schema.incomeReceipt.transactionId, transactionA)))[0].sourceId).toBe(sourceA);
    expect((await tx.select().from(schema.providerConnection).where(eq(schema.providerConnection.id, connectionB)))[0].userId).toBe(secondPrincipal.userId);
  }

  it('checks repeat provisioning and two-user ownership with verified identity fixtures', async () => {
    const identities = new Map<string, VerifiedExternalIdentity>();
    const issuer = `https://securetoken.google.com/${projectId}`;
    const firstToken = randomUUID();
    const secondToken = randomUUID();
    identities.set(firstToken, { provider: 'firebase', issuer, providerSubject: randomUUID(),
      verifiedEmail: `${randomUUID()}@example.com`, displayName: 'First' });
    identities.set(secondToken, { provider: 'firebase', issuer, providerSubject: randomUUID(),
      verifiedEmail: `${randomUUID()}@example.com`, displayName: 'Second' });
    await withApi(async (app, tx) => {
      expect((await request(app.getHttpServer()).get('/auth/config').expect(200)).body)
        .toEqual({ provider: 'firebase' });
      await request(app.getHttpServer()).get('/auth/principal').expect(401);
      await request(app.getHttpServer()).get('/auth/principal')
        .set('Authorization', 'Bearer lazyfinance-demo-token').expect(401);
      await request(app.getHttpServer()).post('/auth/mock/login')
        .send({ email: 'demo@lazyfinance.cl', password: 'password' }).expect(404);
      await checkOwnedFinancialFlow(app, tx, firstToken, secondToken);
    }, async (token) => {
      const identity = identities.get(token);
      if (!identity) throw new UnauthorizedException('Invalid Firebase ID token');
      return identity;
    });
  });

  it('keeps demo login linked only to the demo user when mock auth is selected', async () => {
    await withApi(async (app, tx) => {
      await tx.insert(schema.user).values({ email: mockEmail, name: 'Demo user' }).onConflictDoNothing();
      const [demo] = await tx.select().from(schema.user).where(eq(schema.user.email, mockEmail));
      await tx.insert(schema.externalIdentity).values({
        provider: mockIdentity.provider, issuer: mockIdentity.issuer,
        providerSubject: mockIdentity.providerSubject, userId: demo.id,
      }).onConflictDoNothing();

      const realUserId = randomUUID();
      await tx.insert(schema.user).values({ id: realUserId, email: `${realUserId}@example.com`, name: 'Real user' });
      await tx.insert(schema.externalIdentity).values({
        provider: 'firebase', issuer: `https://securetoken.google.com/${projectId}`,
        providerSubject: randomUUID(), userId: realUserId,
      });
      const [bank] = await tx.insert(schema.provider).values({ identifier: `laz45-${randomUUID()}` })
        .returning({ id: schema.provider.id });
      const [connection] = await tx.insert(schema.providerConnection).values({
        userId: realUserId, providerId: bank.id, mode: 'test',
      }).returning({ id: schema.providerConnection.id });
      const [account] = await tx.insert(schema.account).values({
        userId: realUserId, providerConnectionId: connection.id, type: 'checking', balance: '100.00',
      }).returning({ id: schema.account.id });

      expect((await request(app.getHttpServer()).get('/auth/config').expect(200)).body)
        .toEqual({ provider: 'mock' });
      expect((await request(app.getHttpServer()).post('/auth/mock/login')
        .send({ email: mockEmail, password: 'password' }).expect(201)).body).toEqual({ token: mockToken });
      const demoPrincipal = await request(app.getHttpServer()).get('/auth/principal')
        .set('Authorization', `Bearer ${mockToken}`).expect(200);
      expect(demoPrincipal.body.userId).toBe(demo.id);
      const demoAccounts = await request(app.getHttpServer()).get('/accounts')
        .set('Authorization', `Bearer ${mockToken}`).expect(200);
      expect(demoAccounts.body.map(({ id }: { id: string }) => id)).not.toContain(account.id);
      await request(app.getHttpServer()).get('/auth/principal')
        .set('Authorization', 'Bearer header.payload.signature').expect(401);
      await request(app.getHttpServer()).post('/auth/mock/login')
        .send({ email: mockEmail, password: 'wrong' }).expect(401);
    }, undefined, 'mock');
  });

  it.skipIf(!tokenA || !tokenB)('verifies two live Firebase ID tokens with Admin before the same ownership checks', async () => {
    await withApi(async (app, tx) => {
      await request(app.getHttpServer()).get('/auth/principal')
        .set('Authorization', 'Bearer lazyfinance-demo-token').expect(401);
      const [header, payload, signature] = tokenA!.split('.');
      const invalidSignature = [header, payload, `${signature[0] === 'x' ? 'y' : 'x'}${signature.slice(1)}`].join('.');
      await request(app.getHttpServer()).get('/auth/principal')
        .set('Authorization', `Bearer ${invalidSignature}`).expect(401);
      await checkOwnedFinancialFlow(app, tx, tokenA!, tokenB!);
      if (process.env.TEST_FIREBASE_EXPIRED_ID_TOKEN) {
        await request(app.getHttpServer()).get('/auth/principal')
          .set('Authorization', `Bearer ${process.env.TEST_FIREBASE_EXPIRED_ID_TOKEN}`).expect(401);
      }
    });
  }, 30_000);
});
