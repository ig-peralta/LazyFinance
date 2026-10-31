import { randomUUID } from 'node:crypto';
import type { VerifiedExternalIdentity } from '@lazyfinance/contracts';
import { type INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { eq, inArray } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../app.module';
import { DRIZZLE_PG_CLIENT } from '../drizzle/drizzle.tokens';
import * as schema from '../drizzle/schema';
import { migrateTestDatabase } from '../drizzle/test-migrations';
import { EnvironmentService } from '../environment/environment.service';
import { FirebaseAuthService } from './firebase/firebase-auth.service';

describe.skipIf(!process.env.TEST_POSTGRES_URL)('Firebase application principals against PostgreSQL', () => {
  const issuer = `https://securetoken.google.com/laz44-${randomUUID()}`;
  const issuers = [issuer];
  const fixtureProvider = `laz44-${randomUUID()}`;
  const identities = new Map<string, VerifiedExternalIdentity>();
  const connectionIds: string[] = [];
  const accountIds: string[] = [];
  const transactionIds: string[] = [];
  const legacyUserIds: string[] = [];
  let client: ReturnType<typeof postgres>;
  let db: PostgresJsDatabase<typeof schema>;
  let app: INestApplication;

  function verified(email: string | null, providerSubject = randomUUID()): VerifiedExternalIdentity {
    return { provider: 'firebase', issuer, providerSubject, verifiedEmail: email, displayName: 'Test User' };
  }

  function principalFor(identity: VerifiedExternalIdentity) {
    const token = randomUUID();
    identities.set(token, identity);
    return request(app.getHttpServer()).get('/auth/principal')
      .set('Authorization', `Bearer ${token}`);
  }

  beforeAll(async () => {
    client = postgres(process.env.TEST_POSTGRES_URL!, { max: 12 });
    db = drizzle(client, { schema });
    await migrateTestDatabase(db, process.env.TEST_POSTGRES_URL!);

    const verify = vi.fn(async (token: string) => {
      const identity = identities.get(token);
      if (!identity) throw new UnauthorizedException('Invalid Firebase ID token');
      return identity;
    });
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DRIZZLE_PG_CLIENT).useValue(db)
      .overrideProvider(EnvironmentService).useValue({
        get: (key: string) => key === 'AUTH_PROVIDER' ? 'firebase'
          : key === 'FIREBASE_PROJECT_ID' ? 'lazyfinance-dev' : undefined,
      })
      .overrideProvider(FirebaseAuthService).useValue({ verify }).compile();
    app = module.createNestApplication({ logger: false });
    await app.init();
  });

  afterAll(async () => {
    try {
      await app?.close();
      if (db) {
        if (transactionIds.length) await db.delete(schema.transaction).where(inArray(schema.transaction.id, transactionIds));
        if (accountIds.length) await db.delete(schema.account).where(inArray(schema.account.id, accountIds));
        if (connectionIds.length) await db.delete(schema.providerConnection)
          .where(inArray(schema.providerConnection.id, connectionIds));
        const links = await db.select({ id: schema.externalIdentity.userId }).from(schema.externalIdentity)
          .where(inArray(schema.externalIdentity.issuer, issuers));
        await db.delete(schema.externalIdentity).where(inArray(schema.externalIdentity.issuer, issuers));
        const userIds = [...new Set([...links.map(({ id }) => id), ...legacyUserIds])];
        if (userIds.length) await db.delete(schema.user).where(inArray(schema.user.id, userIds));
        await db.delete(schema.provider).where(eq(schema.provider.identifier, fixtureProvider));
      }
    } finally {
      await client?.end();
    }
  });

  it('creates a financial user once and resolves that user despite later email or name changes', async () => {
    const email = `${randomUUID()}@example.com`;
    const identity = verified(email);
    const first = await principalFor(identity).expect(200);
    const userId = first.body.userId as string;
    expect(first.body).toEqual({ userId, email, name: 'Test User' });
    const [row] = await db.select().from(schema.user).where(eq(schema.user.id, userId));
    expect(row.apiToken).toBeNull();

    const second = await principalFor({ ...identity, verifiedEmail: null, displayName: 'Changed' }).expect(200);
    expect(second.body).toEqual(first.body);
    const links = await db.select().from(schema.externalIdentity)
      .where(eq(schema.externalIdentity.providerSubject, identity.providerSubject));
    expect(links).toHaveLength(1);
    expect(links[0].userId).toBe(userId);
  });

  it('serializes simultaneous first sign-ins of one subject to a single internal user', async () => {
    const email = `${randomUUID()}@example.com`;
    const identity = verified(email);
    const responses = await Promise.all(Array.from({ length: 12 }, () => principalFor(identity).expect(200)));
    expect(responses.every((response) => response.status === 200)).toBe(true);
    expect(new Set(responses.map((response) => response.body.userId))).toHaveProperty('size', 1);
    expect(await db.select().from(schema.user).where(eq(schema.user.email, email))).toHaveLength(1);
    expect(await db.select().from(schema.externalIdentity)
      .where(eq(schema.externalIdentity.providerSubject, identity.providerSubject))).toHaveLength(1);
  }, 15_000);

  it('keeps one user when concurrent requests for a subject carry different verified emails', async () => {
    const subject = randomUUID();
    const emails = [`${randomUUID()}@example.com`, `${randomUUID()}@example.com`];
    const responses = await Promise.all(emails.map((email) => principalFor(verified(email, subject)).expect(200)));
    expect(responses[0].body.userId).toBe(responses[1].body.userId);
    expect(await db.select().from(schema.user).where(inArray(schema.user.email, emails))).toHaveLength(1);
    expect(await db.select().from(schema.externalIdentity)
      .where(eq(schema.externalIdentity.providerSubject, subject))).toHaveLength(1);
  });

  it('never links two different subjects claiming the same verified email', async () => {
    const email = `${randomUUID()}@example.com`;
    const first = verified(email);
    const second = verified(email, randomUUID());
    const responses = await Promise.all([principalFor(first), principalFor(second)]);
    expect(responses.map(({ status }) => status).sort()).toEqual([200, 409]);
    expect(await db.select().from(schema.user).where(eq(schema.user.email, email))).toHaveLength(1);
    expect(await db.select().from(schema.externalIdentity)
      .where(inArray(schema.externalIdentity.providerSubject, [first.providerSubject, second.providerSubject])))
      .toHaveLength(1);
  });

  it('does not confuse the same subject issued by two projects', async () => {
    const otherIssuer = `https://securetoken.google.com/laz44-${randomUUID()}`;
    issuers.push(otherIssuer);
    const subject = randomUUID();
    const first = await principalFor(verified(`${randomUUID()}@example.com`, subject)).expect(200);
    const second = await principalFor({ ...verified(`${randomUUID()}@example.com`, subject), issuer: otherIssuer })
      .expect(200);
    expect(first.body.userId).not.toBe(second.body.userId);
  });

  it('rejects an unverified first email, collisions and demo tokens without linking another user', async () => {
    const noEmail = verified(null);
    await principalFor(noEmail).expect(403);
    expect(await db.select().from(schema.externalIdentity)
      .where(eq(schema.externalIdentity.providerSubject, noEmail.providerSubject))).toHaveLength(0);

    const email = `${randomUUID()}@example.com`;
    const legacyUserId = randomUUID();
    legacyUserIds.push(legacyUserId);
    await db.insert(schema.user).values({ id: legacyUserId, email, name: 'Existing user', apiToken: randomUUID() });
    const collided = verified(email.toUpperCase());
    await principalFor(collided).expect(409);
    expect(await db.select().from(schema.externalIdentity)
      .where(eq(schema.externalIdentity.providerSubject, collided.providerSubject))).toHaveLength(0);
    expect((await db.select().from(schema.user).where(eq(schema.user.id, legacyUserId)))[0].email).toBe(email);

    await request(app.getHttpServer()).get('/auth/principal')
      .set('Authorization', 'Bearer lazyfinance-demo-token').expect(401);
    await request(app.getHttpServer()).post('/auth/mock/login')
      .send({ email: 'demo@lazyfinance.cl', password: 'password' }).expect(404);
  });

  it('scopes account and transaction reads and tag writes to distinct Firebase users', async () => {
    const firstToken = randomUUID();
    const secondToken = randomUUID();
    identities.set(firstToken, verified(`${randomUUID()}@example.com`));
    identities.set(secondToken, verified(`${randomUUID()}@example.com`));
    const api = (token: string) => ({
      get: (path: string) => request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${token}`),
      post: (path: string, body: object) => request(app.getHttpServer()).post(path)
        .set('Authorization', `Bearer ${token}`).send(body),
      put: (path: string, body: object) => request(app.getHttpServer()).put(path)
        .set('Authorization', `Bearer ${token}`).send(body),
    });
    const first = api(firstToken);
    const second = api(secondToken);
    const firstUserId = (await first.get('/auth/principal').expect(200)).body.userId as string;
    const secondUserId = (await second.get('/auth/principal').expect(200)).body.userId as string;
    expect(firstUserId).not.toBe(secondUserId);

    const [provider] = await db.insert(schema.provider).values({ identifier: fixtureProvider })
      .returning({ id: schema.provider.id });
    const connectionA = randomUUID();
    const connectionB = randomUUID();
    connectionIds.push(connectionA, connectionB);
    await db.insert(schema.providerConnection).values([
      { id: connectionA, userId: firstUserId, providerId: provider.id, mode: 'test' },
      { id: connectionB, userId: secondUserId, providerId: provider.id, mode: 'test' },
    ]);
    const accountA = randomUUID();
    const accountB = randomUUID();
    accountIds.push(accountA, accountB);
    await db.insert(schema.account).values([
      { id: accountA, userId: firstUserId, providerConnectionId: connectionA, alias: 'First', type: 'checking', balance: '50.00' },
      { id: accountB, userId: secondUserId, providerConnectionId: connectionB, alias: 'Second', type: 'checking', balance: '75.00' },
    ]);
    const transactionA = randomUUID();
    const transactionB = randomUUID();
    transactionIds.push(transactionA, transactionB);
    await db.insert(schema.transaction).values([
      { id: transactionA, accountId: accountA, type: 'debit', amount: '-10.00',
        bookedAt: new Date('2026-10-25T12:00:00Z'), source: 'manual', isInternalMovement: false },
      { id: transactionB, accountId: accountB, type: 'debit', amount: '-20.00',
        bookedAt: new Date('2026-10-25T12:00:00Z'), source: 'manual', isInternalMovement: false },
    ]);

    expect((await first.get('/accounts').expect(200)).body.map((row: { id: string }) => row.id)).toEqual([accountA]);
    expect((await second.get('/accounts').expect(200)).body.map((row: { id: string }) => row.id)).toEqual([accountB]);
    expect((await first.get(`/accounts?userId=${secondUserId}`).expect(200)).body
      .map((row: { id: string }) => row.id)).toEqual([accountA]);
    expect((await first.get('/transactions/recent').expect(200)).body.map((row: { id: string }) => row.id))
      .toEqual([transactionA]);
    expect((await second.get('/transactions/recent').expect(200)).body.map((row: { id: string }) => row.id))
      .toEqual([transactionB]);

    const tagId = (await first.post('/tags', { name: 'First tag' }).expect(201)).body.id as string;
    await second.put(`/transactions/${transactionA}/tag`, { tagId }).expect(404);
    await first.put(`/transactions/${transactionB}/tag`, { tagId }).expect(404);
    await first.put(`/transactions/${transactionA}/tag`, { tagId, userId: secondUserId }).expect(400);
    expect((await db.select().from(schema.transaction).where(eq(schema.transaction.id, transactionA)))[0].tagId)
      .toBeNull();
  });
});
