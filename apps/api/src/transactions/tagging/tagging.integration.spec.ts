import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { and, eq } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module';
import { MockAuthService } from '../../auth/mock/mock-auth.service';
import { mockIdentity } from '../../auth/mock/mock-auth.constants';
import { testMockAuth } from '../../auth/testing/mock-auth-fixtures';
import { BankingIngestionService } from '../../banking/ingestion/banking-ingestion.service';
import { correctionPage, initialPage } from '../../banking/connector/fixtures/normalized-pages';
import type { BankingConnector } from '../../banking/connector/banking-connector';
import { ConnectorResultSchema } from '../../banking/connector/normalized-banking.schema';
import { DRIZZLE_PG_CLIENT } from '../../drizzle/drizzle.tokens';
import * as schema from '../../drizzle/schema';
import { migrateTestDatabase } from '../../drizzle/test-migrations';
import { TaggingService } from './tagging.service';

type Database = PostgresJsDatabase<typeof schema>;
type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

describe.skipIf(!process.env.TEST_POSTGRES_URL)('owned tag decisions and rules against PostgreSQL', () => {
  let client: ReturnType<typeof postgres>;
  let db: Database;

  beforeAll(async () => {
    client = postgres(process.env.TEST_POSTGRES_URL!, { max: 4 });
    db = drizzle(client, { schema });
    await migrateTestDatabase(db, process.env.TEST_POSTGRES_URL!);
  });
  afterAll(async () => client?.end());

  async function withUsers(work: (context: {
    tx: Tx; userId: string; otherUserId: string; token: string; otherToken: string;
    connectionId: string; accountId: string; movementId: string; otherMovementId: string;
    tagging: TaggingService; ingestion: BankingIngestionService;
  }) => Promise<void>) {
    const rollback = new Error('Rollback tag fixtures');
    await db.transaction(async (tx) => {
      const userId = randomUUID();
      const otherUserId = randomUUID();
      const token = randomUUID();
      const otherToken = randomUUID();
      await tx.insert(schema.user).values([
        { id: userId, email: `${userId}@test.local`, name: 'Owner' },
        { id: otherUserId, email: `${otherUserId}@test.local`, name: 'Other' },
      ]);
      await tx.insert(schema.externalIdentity).values([
        { provider: 'mock', issuer: mockIdentity.issuer, providerSubject: token, userId },
        { provider: 'mock', issuer: mockIdentity.issuer, providerSubject: otherToken, userId: otherUserId },
      ]);
      await tx.insert(schema.provider).values({ identifier: 'fixture-bank' }).onConflictDoNothing();
      const [provider] = await tx.select().from(schema.provider).where(eq(schema.provider.identifier, 'fixture-bank'));
      const connectionId = randomUUID();
      const otherConnectionId = randomUUID();
      await tx.insert(schema.providerConnection).values([
        { id: connectionId, userId, providerId: provider.id, mode: 'test' },
        { id: otherConnectionId, userId: otherUserId, providerId: provider.id, mode: 'test' },
      ]);
      const accountId = randomUUID();
      const otherAccountId = randomUUID();
      await tx.insert(schema.account).values([
        { id: accountId, userId, providerConnectionId: connectionId, type: 'checking', balance: '500.00' },
        { id: otherAccountId, userId: otherUserId, providerConnectionId: otherConnectionId, type: 'checking' },
      ]);
      const movementId = randomUUID();
      const otherMovementId = randomUUID();
      await tx.insert(schema.transaction).values([
        { id: movementId, accountId, type: 'debit', amount: '-25.00', bookedAt: new Date('2026-10-12T16:00:00Z'),
          merchant: '  The   Market ', description: 'Groceries', source: 'manual', isInternalMovement: false },
        { id: otherMovementId, accountId: otherAccountId, type: 'debit', amount: '-25.00',
          bookedAt: new Date('2026-10-12T16:00:00Z'), merchant: 'The Market', source: 'manual', isInternalMovement: false },
      ]);
      const tagging = new TaggingService(tx as unknown as Database);
      const ingestion = new BankingIngestionService(tx as unknown as Database, tagging);
      await work({ tx, userId, otherUserId, token, otherToken, connectionId, accountId, movementId, otherMovementId,
        tagging, ingestion });
      throw rollback;
    }).catch((error) => { if (error !== rollback) throw error; });
  }

  it('lets the authenticated owner choose a tag, deliberately choose none, and reset without cross-user access', async () => {
    await withUsers(async ({ tx, userId, otherUserId, token, otherToken, movementId, otherMovementId }) => {
      const { verifier } = testMockAuth({
        [token]: { userId, email: `${userId}@test.local`, name: 'Owner' },
        [otherToken]: { userId: otherUserId, email: `${otherUserId}@test.local`, name: 'Other' },
      });
      const module = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(DRIZZLE_PG_CLIENT).useValue(tx)
        .overrideProvider(MockAuthService).useValue(verifier).compile();
      const app: INestApplication = module.createNestApplication({ logger: false });
      try {
        await app.init();
        const api = (method: 'get' | 'post' | 'put' | 'delete', path: string, body?: object, bearer = token) =>
          request(app.getHttpServer())[method](path).set('Authorization', `Bearer ${bearer}`).send(body);
        await request(app.getHttpServer()).get('/tags').expect(401);
        const created = await api('post', '/tags', { name: 'Comida', color: '#abc123' }).expect(201);
        const ownTagId = created.body.id as string;
        expect((await api('get', '/tags').expect(200)).body).toMatchObject([{ id: ownTagId }]);
        expect((await api('post', '/tags', { name: 'Comida' }).expect(201)).body)
          .toMatchObject({ id: ownTagId, color: '#abc123' });
        const otherTagId = (await api('post', '/tags', { name: 'Otro' }, otherToken).expect(201)).body.id as string;
        await api('put', `/transactions/${movementId}/tag`, { tagId: otherTagId }).expect(404);
        await api('put', `/transactions/${otherMovementId}/tag`, { tagId: ownTagId }).expect(404);
        await api('put', `/transactions/${movementId}/tag`, { tagId: ownTagId, userId }).expect(400);

        expect((await api('put', `/transactions/${movementId}/tag`, { tagId: ownTagId }).expect(200)).body)
          .toMatchObject({ tagId: ownTagId, origin: 'manual', ruleId: null });
        expect((await api('put', `/transactions/${movementId}/tag`, { tagId: null }).expect(200)).body)
          .toMatchObject({ tagId: null, origin: 'manual' });
        expect((await api('delete', `/transactions/${movementId}/tag-decision`).expect(200)).body)
          .toMatchObject({ tagId: null, origin: 'unreviewed' });
        const ruleInput = { tagId: ownTagId, direction: 'debit', matchField: 'merchant',
          matchValue: 'The Market', autoApply: false };
        const ruleId = (await api('post', '/tag-rules', ruleInput).expect(201)).body.id as string;
        expect((await api('get', `/transactions/${movementId}/tag-suggestions`).expect(200)).body)
          .toMatchObject([{ ruleId, tagId: ownTagId, confidence: 'high', autoApply: false }]);
        await api('put', `/tag-rules/${ruleId}`, { ...ruleInput, autoApply: true }).expect(200);
        expect((await api('post', `/tag-rules/${ruleId}/apply`).expect(200)).body)
          .toEqual({ changed: 1, nextCursor: null });
        expect((await api('get', '/tag-rules').expect(200)).body)
          .toMatchObject([{ id: ruleId, mode: 'auto' }]);
        await api('post', `/tag-rules/${ruleId}/archive`).expect(200);
        const events = await tx.select().from(schema.tagDecisionEvent)
          .where(eq(schema.tagDecisionEvent.transactionId, movementId));
        expect(events.map(({ kind }) => kind))
          .toEqual(['manual_tag', 'manual_no_tag', 'reset', 'rule_applied']);
        expect(await tx.select().from(schema.tagDecisionEvent)
          .where(eq(schema.tagDecisionEvent.transactionId, otherMovementId))).toEqual([]);
      } finally {
        await app.close();
      }
    });
  });

  it('keeps suggestions separate from decisions and requires explicit approval for automatic tagging', async () => {
    await withUsers(async ({ tx, userId, otherUserId, accountId, movementId, tagging }) => {
      const food = await tagging.createTagForUser(userId, { name: 'Food' });
      const other = await tagging.createTagForUser(otherUserId, { name: 'Other' });
      const input = { tagId: food.id, direction: 'debit', matchField: 'merchant', matchValue: ' the market ',
        accountId, priority: 10 };
      await expect(tagging.createRuleForUser(userId, { ...input, tagId: other.id }))
        .rejects.toThrow('Tag not found');
      await expect(tagging.createRuleForUser(userId, { ...input, matchField: 'description', autoApply: true }))
        .rejects.toThrow('Invalid tag input');
      const rule = await tagging.createRuleForUser(userId, input);
      expect(rule).toMatchObject({ matchValue: 'the market', mode: 'suggest', approvedAt: null });
      expect((await tagging.createRuleForUser(userId, input)).id).toBe(rule.id);
      const suggestions = await tagging.suggestionsForUser(userId, movementId);
      expect(suggestions).toMatchObject([{ ruleId: rule.id, tagId: food.id, confidence: 'high', autoApply: false }]);
      expect((await tx.select().from(schema.transaction).where(eq(schema.transaction.id, movementId)))[0])
        .toMatchObject({ tagId: null, tagDecisionOrigin: 'unreviewed' });

      await tagging.assignManualTagForUser(userId, movementId, { tagId: null });
      expect(await tagging.suggestionsForUser(userId, movementId)).toEqual([]);
      await tagging.resetTagDecisionForUser(userId, movementId);
      const approved = await tagging.createRuleForUser(userId, { ...input, autoApply: true });
      expect(approved).toMatchObject({ id: rule.id, mode: 'auto' });
      expect(approved.approvedAt).not.toBeNull();
      await expect(tagging.replaceRuleForUser(otherUserId, rule.id, { ...input, autoApply: true }))
        .rejects.toThrow('Tag rule not found');
      expect((await tx.select().from(schema.transaction).where(eq(schema.transaction.id, movementId)))[0].tagId)
        .toBeNull(); // Approval affects future imports; it does not silently rewrite existing history.
      expect(await tagging.applyApprovedRuleToExistingForUser(userId, rule.id))
        .toEqual({ changed: 1, nextCursor: null });
      expect((await tx.select().from(schema.transaction).where(eq(schema.transaction.id, movementId)))[0])
        .toMatchObject({ tagId: food.id, tagDecisionOrigin: 'rule', tagRuleId: rule.id });
      expect(await tagging.applyApprovedRuleToExistingForUser(userId, rule.id))
        .toEqual({ changed: 0, nextCursor: null });
      await tagging.assignManualTagForUser(userId, movementId, { tagId: null });
      expect(await tagging.applyApprovedRuleToExistingForUser(userId, rule.id))
        .toEqual({ changed: 0, nextCursor: null });
      const uncertainId = randomUUID();
      await tx.insert(schema.transaction).values({ id: uncertainId, accountId, type: 'debit', amount: '-10.00',
        bookedAt: new Date('2026-10-14T16:00:00Z'), merchant: 'THE MARKET', isInternalMovement: null });
      expect(await tagging.applyApprovedRuleToExistingForUser(userId, rule.id))
        .toEqual({ changed: 0, nextCursor: null });
      expect(await tagging.suggestionsForUser(userId, uncertainId))
        .toMatchObject([{ tagId: food.id, confidence: 'high', autoApply: false }]);
    });
  });

  it('auto-tags only approved matches, re-evaluates rule-derived tags on corrections and preserves manual choices', async () => {
    await withUsers(async ({ tx, userId, connectionId, tagging, ingestion }) => {
      const groceries = await tagging.createTagForUser(userId, { name: 'Groceries' });
      const purchases = await tagging.createTagForUser(userId, { name: 'Purchases' });
      await tagging.createRuleForUser(userId, {
        tagId: groceries.id, direction: 'debit', matchField: 'merchant', matchValue: 'Market', autoApply: false,
      });
      const auto = await tagging.createRuleForUser(userId, {
        tagId: purchases.id, direction: 'debit', matchField: 'merchant', matchValue: 'Shop', autoApply: true,
      });
      const connector = (page: unknown): BankingConnector => ({
        provider: 'fixture-bank', fetchPage: async () => ConnectorResultSchema.parse(page),
      });
      expect((await ingestion.syncForUser(userId, connectionId, connector(initialPage))).status).toBe('complete');
      const [checking] = await tx.select().from(schema.account).where(eq(schema.account.externalId, 'checking-1'));
      const [card] = await tx.select().from(schema.account).where(eq(schema.account.externalId, 'card-1'));
      const [grocery] = await tx.select().from(schema.transaction).where(and(
        eq(schema.transaction.accountId, checking.id), eq(schema.transaction.externalId, 'grocery-1'),
      ));
      const [cardPurchase] = await tx.select().from(schema.transaction).where(and(
        eq(schema.transaction.accountId, card.id), eq(schema.transaction.externalId, 'card-purchase-1'),
      ));
      expect(grocery).toMatchObject({ tagId: null, tagDecisionOrigin: 'unreviewed' });
      expect(cardPurchase).toMatchObject({ tagId: purchases.id, tagDecisionOrigin: 'rule', tagRuleId: auto.id });
      expect((await tx.select().from(schema.tagDecisionEvent)
        .where(eq(schema.tagDecisionEvent.transactionId, cardPurchase.id))).map(({ kind }) => kind))
        .toEqual(['rule_applied']);
      expect((await ingestion.syncForUser(userId, connectionId, connector(initialPage))).status).toBe('complete');
      expect((await tx.select().from(schema.tagDecisionEvent)
        .where(eq(schema.tagDecisionEvent.transactionId, cardPurchase.id))).map(({ kind }) => kind))
        .toEqual(['rule_applied']);
      expect(await tagging.suggestionsForUser(userId, grocery.id)).toMatchObject([{
        tagId: groceries.id, confidence: 'high', autoApply: false,
      }]);

      await tagging.assignManualTagForUser(userId, grocery.id, { tagId: groceries.id });
      expect((await ingestion.syncForUser(userId, connectionId, connector(correctionPage))).status).toBe('complete');
      expect((await tx.select().from(schema.transaction).where(eq(schema.transaction.id, grocery.id)))[0])
        .toMatchObject({ amount: '-120.00', tagId: groceries.id, tagDecisionOrigin: 'manual' });

      const cardCorrection = { ...initialPage, observedAt: '2026-10-20T18:00:00.000Z',
        checkpoint: 'card-merchant-corrected', accounts: [],
        movements: [{ ...initialPage.movements[4], merchant: 'New Shop' }] };
      expect((await ingestion.syncForUser(userId, connectionId, connector(cardCorrection))).status).toBe('complete');
      expect((await tx.select().from(schema.transaction).where(eq(schema.transaction.id, cardPurchase.id)))[0])
        .toMatchObject({ tagId: null, tagRuleId: null, tagDecisionOrigin: 'unreviewed' });
      const events = await tx.select().from(schema.tagDecisionEvent)
        .where(eq(schema.tagDecisionEvent.transactionId, cardPurchase.id));
      expect(events.map(({ kind }) => kind)).toEqual(['rule_applied', 'rule_revalidated']);

      await tagging.assignManualTagForUser(userId, cardPurchase.id, { tagId: null });
      const correctedBack = { ...cardCorrection, observedAt: '2026-10-21T18:00:00.000Z',
        checkpoint: 'card-merchant-restored', movements: [initialPage.movements[4]] };
      await ingestion.syncForUser(userId, connectionId, connector(correctedBack));
      expect((await tx.select().from(schema.transaction).where(eq(schema.transaction.id, cardPurchase.id)))[0])
        .toMatchObject({ tagId: null, tagDecisionOrigin: 'manual' });
    });
  });

  it('keeps historical rule tags when the rule changes and revalidates them on provider correction', async () => {
    await withUsers(async ({ tx, userId, connectionId, tagging, ingestion }) => {
      const first = await tagging.createTagForUser(userId, { name: 'First' });
      const second = await tagging.createTagForUser(userId, { name: 'Second' });
      const ruleInput = { tagId: first.id, direction: 'debit', matchField: 'merchant',
        matchValue: 'Market', autoApply: true };
      const rule = await tagging.createRuleForUser(userId, ruleInput);
      const connector = { provider: 'fixture-bank', fetchPage: async () => ConnectorResultSchema.parse(initialPage) };
      await ingestion.syncForUser(userId, connectionId, connector);
      const [checking] = await tx.select().from(schema.account).where(eq(schema.account.externalId, 'checking-1'));
      const [grocery] = await tx.select().from(schema.transaction).where(and(
        eq(schema.transaction.accountId, checking.id), eq(schema.transaction.externalId, 'grocery-1'),
      ));
      expect(grocery).toMatchObject({ tagId: first.id, tagDecisionOrigin: 'rule' });

      await tagging.replaceRuleForUser(userId, rule.id, { ...ruleInput, tagId: second.id });
      expect((await tx.select().from(schema.transaction).where(eq(schema.transaction.id, grocery.id)))[0])
        .toMatchObject({ tagId: first.id, tagDecisionOrigin: 'rule' });
      await ingestion.syncForUser(userId, connectionId, { provider: 'fixture-bank',
        fetchPage: async () => ConnectorResultSchema.parse(correctionPage) });
      expect((await tx.select().from(schema.transaction).where(eq(schema.transaction.id, grocery.id)))[0])
        .toMatchObject({ tagId: second.id, tagDecisionOrigin: 'rule' });
      await tagging.archiveRuleForUser(userId, rule.id);
      expect((await tx.select().from(schema.transaction).where(eq(schema.transaction.id, grocery.id)))[0])
        .toMatchObject({ tagId: second.id, tagDecisionOrigin: 'rule' });
      await ingestion.syncForUser(userId, connectionId, { provider: 'fixture-bank',
        fetchPage: async () => ConnectorResultSchema.parse({
          ...correctionPage, observedAt: '2026-10-18T18:00:00.000Z', checkpoint: 'unchanged-replay',
        }) });
      expect((await tx.select().from(schema.transaction).where(eq(schema.transaction.id, grocery.id)))[0])
        .toMatchObject({ tagId: second.id, tagDecisionOrigin: 'rule' });
      await ingestion.syncForUser(userId, connectionId, { provider: 'fixture-bank',
        fetchPage: async () => ConnectorResultSchema.parse({
          ...correctionPage, observedAt: '2026-10-19T18:00:00.000Z', checkpoint: 'new-merchant',
          accounts: [], movements: [{ ...correctionPage.movements[0], merchant: 'Another Market', amount: '-121.00' }],
        }) });
      expect((await tx.select().from(schema.transaction).where(eq(schema.transaction.id, grocery.id)))[0])
        .toMatchObject({ tagId: null, tagRuleId: null, tagDecisionOrigin: 'unreviewed' });
      expect((await tx.select().from(schema.tagDecisionEvent)
        .where(eq(schema.tagDecisionEvent.transactionId, grocery.id))).map(({ kind }) => kind))
        .toEqual(['rule_applied', 'rule_revalidated', 'rule_revalidated']);

      await tagging.assignManualTagForUser(userId, grocery.id, { tagId: first.id });
      await tagging.replaceRuleForUser(userId, rule.id, { ...ruleInput, tagId: second.id });
      expect((await tx.select().from(schema.transaction).where(eq(schema.transaction.id, grocery.id)))[0])
        .toMatchObject({ tagId: first.id, tagDecisionOrigin: 'manual' });
    });
  });
});
