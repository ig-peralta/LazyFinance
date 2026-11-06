import "reflect-metadata";
import { generateKeyPairSync, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { CommitProviderSync } from "@lazyfinance/contracts/internal";
import {
  createContextSigner,
  createContextVerifier,
} from "@lazyfinance/rpc-auth";
import type { PersistenceRouter } from "@lazyfinance/rpc-persistence";
import { type INestApplication, Inject } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  createTRPCClient,
  createTRPCUntypedClient,
  httpLink,
} from "@trpc/client";
import { TRPCError } from "@trpc/server";
import { type Kysely, sql } from "kysely";
import { Migrator } from "kysely/migration";
import { AppRouterHost, Ctx, Input, Mutation, Router } from "nestjs-trpc";
import { z } from "zod";
import { AppModule } from "../app.module";
import type { PersistenceRequestContext } from "../rpc/persistence.context";
import { createDatabase } from "./connection";
import { DatabaseModule } from "./database.module";
import { MultiMigrationProvider, migrate } from "./migrator";
import { assertRuntimeRole, provisionRuntime } from "./provision";
import {
  createRlsDbProxy,
  OutsideRlsSessionError,
  withRequestContext,
} from "./rls";
import { RLS_DB } from "./tokens";

@Router({ alias: "failure" })
class FailureRouter {
  constructor(
    @Inject(RLS_DB) private readonly db: Kysely<Record<string, never>>,
  ) {}

  @Mutation({
    input: z.object({ name: z.string() }),
    output: z.boolean(),
    meta: { context: "user" },
  })
  async writeThenThrow(
    @Input() value: { name: string },
    @Ctx() ctx: PersistenceRequestContext,
  ) {
    if (ctx.identity.kind !== "user") throw new Error("Wrong context");

    await sql`insert into finance.tag(user_id, name) values (${ctx.identity.userId}, ${value.name})`.execute(
      this.db,
    );
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Intentional failure",
    });
  }

  @Mutation({
    input: z.object({ name: z.string() }),
    output: z.boolean(),
    meta: { context: "user" },
  })
  async invalidOutput(
    @Input() value: { name: string },
    @Ctx() ctx: PersistenceRequestContext,
  ) {
    if (ctx.identity.kind !== "user") throw new Error("Wrong context");

    await sql`insert into finance.tag(user_id, name) values (${ctx.identity.userId}, ${value.name})`.execute(
      this.db,
    );

    return "not a boolean";
  }
}

const ownerUrl = process.env.TEST_POSTGRES_OWNER_URL;

const migrationProvider = () =>
  new MultiMigrationProvider((file) => import(file));

describe.skipIf(!ownerUrl)(
  "persistence boundary with real PostgreSQL runtime roles",
  () => {
    let owner: Kysely<any>;
    let runtime: Kysely<any>;
    let app: INestApplication;
    let url: string;
    let sign: Awaited<ReturnType<typeof createContextSigner>>;
    const a = randomUUID(),
      b = randomUUID();
    const connectionA = randomUUID(),
      connectionB = randomUUID();
    const accountA = randomUUID(),
      accountB = randomUUID();
    const tagA = randomUUID(),
      tagB = randomUUID();
    const sourceA = randomUUID(),
      sourceB = randomUUID();
    const movementA = randomUUID(),
      movementB = randomUUID();
    const objectiveA = randomUUID(),
      objectiveB = randomUUID();
    const ruleA = randomUUID(),
      ruleB = randomUUID();
    const ctx = (userId: string) => ({
      kind: "user" as const,
      userId,
      requestId: randomUUID(),
    });

    beforeAll(async () => {
      const target = new URL(ownerUrl!);
      if (!target.pathname.endsWith("_test"))
        throw new Error(
          "Integration tests require a disposable database ending in _test",
        );

      owner = createDatabase(ownerUrl!, false);
      await migrate(owner, migrationProvider());
      await provisionRuntime(
        owner,
        "lazyfinance_test_runtime",
        "runtime-test-password-only",
      );
      target.username = "lazyfinance_test_runtime";
      target.password = "runtime-test-password-only";
      runtime = createDatabase(target.toString(), false);
      await assertRuntimeRole(runtime);
      const { privateKey, publicKey } = generateKeyPairSync("ed25519");
      const privatePem = privateKey
        .export({ type: "pkcs8", format: "pem" })
        .toString();
      const publicPem = publicKey
        .export({ type: "spki", format: "pem" })
        .toString();
      sign = await createContextSigner(privatePem);
      process.env.POSTGRES_RUNTIME_URL = target.toString();
      process.env.PERSISTENCE_RPC_PUBLIC_KEY = publicPem;
      const module = await Test.createTestingModule({
        imports: [AppModule, DatabaseModule],
        providers: [FailureRouter],
      }).compile();
      app = module.createNestApplication({ logger: false });
      await app.listen(0, "127.0.0.1");
      url = await app.getUrl();
      await sql`insert into identity."user"(id,email,name) values (${a}, ${a + "@example.test"}, 'A'), (${b}, ${b + "@example.test"}, 'B')`.execute(
        owner,
      );
      const provider = randomUUID();
      await sql`insert into finance.provider(id,identifier) values (${provider}, ${provider})`.execute(
        owner,
      );
      await sql`insert into finance.provider_connection(id,user_id,provider_id) values (${connectionA},${a},${provider}), (${connectionB},${b},${provider})`.execute(
        owner,
      );
      await sql`insert into finance.account(id,user_id,provider_connection_id,type,balance) values
      (${accountA},${a},${connectionA},'checking','9007199254740.99'), (${accountB},${b},${connectionB},'checking','12.34')`.execute(
        owner,
      );
      await sql`insert into finance.tag(id,user_id,name) values (${tagA},${a},'A'), (${tagB},${b},'B')`.execute(
        owner,
      );
      await sql`insert into finance.tag_rule(id,user_id,tag_id,direction,match_field,match_value) values
      (${ruleA},${a},${tagA},'debit','merchant','a'), (${ruleB},${b},${tagB},'debit','merchant','b')`.execute(
        owner,
      );
      await sql`insert into finance."transaction"(id,account_id,booked_at,amount,type) values
      (${movementA},${accountA},now(),1,'credit'), (${movementB},${accountB},now(),1,'credit')`.execute(
        owner,
      );
      await sql`insert into finance.income_source(id,user_id,name,regularity,amount_kind,start_date) values
      (${sourceA},${a},'A','irregular','variable','2026-01-01'), (${sourceB},${b},'B','irregular','variable','2026-01-01')`.execute(
        owner,
      );
      await sql`insert into finance.objective(id,user_id,name,amount,kind,intent) values
      (${objectiveA},${a},'A',1,'amount_based','spending'), (${objectiveB},${b},'B',1,'amount_based','spending')`.execute(
        owner,
      );

      for (const [user, connection, movement, source, tag, rule, objective] of [
        [a, connectionA, movementA, sourceA, tagA, ruleA, objectiveA],
        [b, connectionB, movementB, sourceB, tagB, ruleB, objectiveB],
      ]) {
        await sql`insert into finance.income_expectation(source_id,date,amount) values (${source},'2026-01-01',1)`.execute(
          owner,
        );
        await sql`insert into finance.income_receipt(transaction_id,source_id) values (${movement},${source})`.execute(
          owner,
        );
        await sql`insert into finance.objective_tag(objective_id,tag_id) values (${objective},${tag})`.execute(
          owner,
        );
        await sql`insert into finance.tag_decision_event(user_id,transaction_id,tag_id,rule_id,kind) values (${user},${movement},${tag},${rule},'manual_tag')`.execute(
          owner,
        );
        await sql`insert into finance.provider_sync_state(provider_connection_id) values (${connection})`.execute(
          owner,
        );
        await sql`insert into finance.provider_movement_removal(provider_connection_id,account_external_id,movement_external_id,reason,observed_at)
        values (${connection},'missing','removed','removed',now())`.execute(
          owner,
        );
        await sql`insert into finance.provider_movement_conflict(transaction_id,reason,previous_facts,incoming_facts,observed_at)
        values (${movement},'receipt_incompatible','{}','{}',now())`.execute(
          owner,
        );
      }

      // Retain a verifier check for a valid signed context, independent of HTTP.
      expect(
        await (await createContextVerifier(publicPem))(
          `Bearer ${await sign(ctx(a))}`,
        ),
      ).toMatchObject({ userId: a });
    });

    afterAll(async () => {
      await app?.close();
      await runtime?.destroy();
      await owner?.destroy();
    });

    it("uses a real non-owner login and rejects owner credentials", async () => {
      await expect(assertRuntimeRole(owner)).rejects.toThrow("non-owner");
      expect(
        await provisionRuntime(
          owner,
          "lazyfinance_test_runtime",
          "a-different-password",
        ),
      ).toEqual({ created: false });
    });
    it("matches the committed private generated surface and requires context metadata everywhere", () => {
      const generated = readFileSync(
        path.join(
          path.dirname(require.resolve("@lazyfinance/rpc-persistence")),
          "../src/generated/server.ts",
        ),
        "utf8",
      );
      const expected: string[] = [];
      let group = "";

      for (const line of generated.split("\n")) {
        group = /^ {2}(\w+): t\.router/.exec(line)?.[1] ?? group;
        const method = /^ {4}(\w+): publicProcedure/.exec(line)?.[1];

        if (method) expected.push(`${group}.${method}`);
      }

      const procedures = app.get(AppRouterHost).appRouter._def.procedures;
      expect(
        Object.keys(procedures)
          .filter((name) => !name.startsWith("failure."))
          .sort(),
      ).toEqual(expected.sort());
      expect(expected).toHaveLength(35);

      for (const name of expected)
        expect(procedures[name]._def.meta).toMatchObject({
          context: name === "identity.resolve" ? "identity-bootstrap" : "user",
        });
    });

    it("migrates idempotently and enables/forces RLS on all 16 sensitive tables", async () => {
      expect(await migrate(owner, migrationProvider())).toEqual([]);
      const { rows } = await sql<{
        relrowsecurity: boolean;
        relforcerowsecurity: boolean;
      }>`select relrowsecurity, relforcerowsecurity
      from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('identity','finance') and c.relkind='r' and c.relname != 'provider'`.execute(
        owner,
      );
      expect(rows).toHaveLength(16);
      expect(
        rows.every((row) => row.relrowsecurity && row.relforcerowsecurity),
      ).toBe(true);
    });

    it("rolls back an unsuccessful migration without recording it", async () => {
      const result = await new Migrator({
        db: owner,
        migrationTableName: "probe_migration",
        migrationLockTableName: "probe_lock",
        provider: {
          getMigrations: async () => ({
            "1-fails": {
              up: async (db) => {
                await sql`create table public.atomic_probe(id integer)`.execute(
                  db,
                );
                throw new Error("migration probe");
              },
            },
          }),
        },
      }).migrateToLatest();
      expect(result.error).toBeDefined();
      const {
        rows: [row],
      } = await sql<{
        name: string | null;
      }>`select to_regclass('public.atomic_probe')::text as name`.execute(
        owner,
      );
      expect(row.name).toBeNull();
    });

    it("protects every financial table without user WHERE predicates", async () => {
      const tables = [
        "provider_connection",
        "account",
        "tag",
        "tag_rule",
        "transaction",
        "tag_decision_event",
        "objective",
        "objective_tag",
        "income_source",
        "income_expectation",
        "income_receipt",
        "provider_sync_state",
        "provider_movement_removal",
        "provider_movement_conflict",
      ];
      await withRequestContext(runtime, ctx(a), async (tx) => {
        for (const table of tables) {
          const {
            rows: [row],
          } = await sql<{
            count: string;
          }>`select count(*)::text as count from ${sql.id("finance", table)}`.execute(
            tx,
          );
          expect(row.count, table).toBe("1");
        }
      });
      const {
        rows: [row],
      } = await sql<{
        count: string;
      }>`select count(*)::text as count from finance.account`.execute(runtime);
      expect(row.count).toBe("0");
    });

    it("restricts identity access, shared catalog writes and audit mutations independently of RLS", async () => {
      await withRequestContext(runtime, ctx(a), async (tx) => {
        const { rows } = await sql<{
          id: string;
        }>`select id from identity."user"`.execute(tx);
        expect(rows.map((row) => row.id)).toEqual([a]);
      });

      for (const work of [
        (db: Kysely<any>) =>
          sql`select * from identity.external_identity`.execute(db),
        (db: Kysely<any>) =>
          sql`insert into finance.provider(identifier) values (${randomUUID()})`.execute(
            db,
          ),
        (db: Kysely<any>) =>
          sql`update finance.tag_decision_event set kind='reset' where user_id=${a}`.execute(
            db,
          ),
        (db: Kysely<any>) =>
          sql`set local role lazyfinance_identity_bootstrap`.execute(db),
      ])
        await expect(withRequestContext(runtime, ctx(a), work)).rejects.toThrow(
          "permission denied",
        );
    });

    it("sets request identity and timeout budgets transaction-locally", async () => {
      const identity = ctx(a);
      await withRequestContext(runtime, identity, async (tx) => {
        const {
          rows: [settings],
        } = await sql<Record<string, string>>`select
        current_setting('lazyfinance.user_id') as user_id,current_setting('lazyfinance.request_id') as request_id,
        current_setting('statement_timeout') as statement,current_setting('lock_timeout') as lock,
        current_setting('idle_in_transaction_session_timeout') as idle,current_setting('transaction_timeout') as transaction`.execute(
          tx,
        );
        expect(settings).toEqual({
          user_id: a,
          request_id: identity.requestId,
          statement: "20s",
          lock: "5s",
          idle: "10s",
          transaction: "100s",
        });
      });
      const {
        rows: [settings],
      } = await sql<Record<string, string | null>>`select
      nullif(current_setting('lazyfinance.user_id',true),'') as user_id,
      nullif(current_setting('lazyfinance.request_id',true),'') as request_id`.execute(
        runtime,
      );
      expect(settings).toEqual({ user_id: null, request_id: null });
    });

    it("denies cross-user foreign references and owner reassignment", async () => {
      for (const work of [
        (db: Kysely<any>) =>
          sql`insert into finance.account(user_id,provider_connection_id,type) values (${a},${connectionB},'checking')`.execute(
            db,
          ),
        (db: Kysely<any>) =>
          sql`update finance.account set user_id=${b} where id=${accountA}`.execute(
            db,
          ),
        (db: Kysely<any>) =>
          sql`update finance."transaction" set tag_id=${tagB},tag_decision_origin='manual' where id=${movementA}`.execute(
            db,
          ),
        (db: Kysely<any>) =>
          sql`update finance.tag_rule set account_id=${accountB} where id=${ruleA}`.execute(
            db,
          ),
        (db: Kysely<any>) =>
          sql`update finance.income_receipt set source_id=${sourceB} where transaction_id=${movementA}`.execute(
            db,
          ),
        (db: Kysely<any>) =>
          sql`insert into finance.objective_tag(objective_id,tag_id) values (${objectiveA},${tagB})`.execute(
            db,
          ),
        (db: Kysely<any>) =>
          sql`insert into finance.tag_decision_event(user_id,transaction_id,kind) values (${a},${movementB},'reset')`.execute(
            db,
          ),
      ])
        await expect(
          withRequestContext(runtime, ctx(a), work),
        ).rejects.toThrow();
    });

    it("isolates concurrent users and clears pooled identity after both commit and rollback", async () => {
      await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          withRequestContext(runtime, ctx(i % 2 ? a : b), async (tx) => {
            const { rows } = await sql<{
              id: string;
            }>`select id from finance.account`.execute(tx);
            expect(rows.map((row) => row.id)).toEqual([
              i % 2 ? accountA : accountB,
            ]);
          }),
        ),
      );
      await expect(
        withRequestContext(runtime, ctx(a), async () => {
          throw new Error("rollback");
        }),
      ).rejects.toThrow("rollback");
      expect(() => createRlsDbProxy().selectFrom).toThrow(
        OutsideRlsSessionError,
      );
      const { rows } = await sql`select * from finance.account`.execute(
        runtime,
      );
      expect(rows).toEqual([]);
    });

    it("serves typed, precision-safe accounts and rejects unauthenticated/context-confused requests", async () => {
      const client = createTRPCClient<PersistenceRouter>({
        links: [
          httpLink({
            url: `${url}/trpc`,
            headers: async () => ({
              authorization: `Bearer ${await sign(ctx(a))}`,
            }),
          }),
        ],
      });
      expect(await client.accounts.listActive.query()).toEqual([
        expect.objectContaining({ id: accountA, balance: "9007199254740.99" }),
      ]);
      expect((await fetch(`${url}/trpc/accounts.listActive`)).status).toBe(401);
      const bootstrap = await sign({
        kind: "identity-bootstrap",
        requestId: randomUUID(),
        identity: {
          provider: "firebase",
          issuer: "https://securetoken.google.com/test",
          providerSubject: randomUUID(),
          verifiedEmail: "bootstrap@example.test",
          displayName: "Bootstrap",
        },
      });
      const forbidden = await fetch(`${url}/trpc/accounts.listActive`, {
        headers: { authorization: `Bearer ${bootstrap}` },
      });
      expect(forbidden.status).toBe(403);
    });

    it("provisions a stable identity concurrently and never links by email", async () => {
      const identity = {
        provider: "firebase",
        issuer: "https://securetoken.google.com/test",
        providerSubject: randomUUID(),
        verifiedEmail: randomUUID() + "@example.test",
        displayName: "Person",
      };
      const clientFor = (value = identity) =>
        createTRPCClient<PersistenceRouter>({
          links: [
            httpLink({
              url: `${url}/trpc`,
              headers: async () => ({
                authorization: `Bearer ${await sign({ kind: "identity-bootstrap", requestId: randomUUID(), identity: value })}`,
              }),
            }),
          ],
        });
      const people = await Promise.all(
        Array.from({ length: 5 }, () =>
          clientFor().identity.resolve.mutate({ mode: "provision" }),
        ),
      );
      expect(new Set(people.map((person) => person.userId)).size).toBe(1);
      await expect(
        clientFor({
          ...identity,
          providerSubject: randomUUID(),
        }).identity.resolve.mutate({ mode: "provision" }),
      ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
      await expect(
        owner.transaction().execute(async (tx) => {
          await sql`set local role lazyfinance_identity_bootstrap`.execute(tx);
          await sql`select * from finance.account`.execute(tx);
        }),
      ).rejects.toThrow("permission denied");
    });

    it("exposes bounded financial facts and joins only records owned by the current user", async () => {
      const client = createTRPCClient<PersistenceRouter>({
        links: [
          httpLink({
            url: `${url}/trpc`,
            headers: async () => ({
              authorization: `Bearer ${await sign(ctx(a))}`,
            }),
          }),
        ],
      });
      const period = {
        start: "2026-01-01 00:00:00",
        end: "2027-01-01 00:00:00",
      };
      expect(await client.transactions.recent.query()).toEqual([
        expect.objectContaining({
          id: movementA,
          accountId: accountA,
          tag: null,
        }),
      ]);
      expect(await client.transactions.aggregates.query(period)).toEqual([
        expect.objectContaining({
          type: "credit",
          hasReceipt: true,
          amount: "1.00",
          count: 1,
        }),
      ]);
      expect(await client.objectives.list.query()).toEqual([
        expect.objectContaining({ id: objectiveA }),
      ]);
      expect(
        await client.objectives.tags.query({ ids: [objectiveA, objectiveB] }),
      ).toEqual([
        { objectiveId: objectiveA, id: tagA, name: "A", color: null },
      ]);
      expect(await client.tags.list.query()).toEqual([
        { id: tagA, name: "A", color: null, isArchived: false },
      ]);
      const facts = await client.income.facts.query(period);
      expect(facts.sources).toEqual([
        expect.objectContaining({
          id: sourceA,
          userId: a,
          startDate: "2026-01-01",
        }),
      ]);
      expect(facts.expectations).toEqual([
        expect.objectContaining({ sourceId: sourceA, amount: "1.00" }),
      ]);
      expect(facts.receipts).toEqual([
        expect.objectContaining({
          transactionId: movementA,
          sourceId: sourceA,
        }),
      ]);
      expect(facts.aggregates).toEqual(
        await client.transactions.aggregates.query(period),
      );
    });

    it("keeps income source/expectation changes and receipt confirmation authoritative and atomic", async () => {
      const client = createTRPCClient<PersistenceRouter>({
        links: [
          httpLink({
            url: `${url}/trpc`,
            headers: async () => ({
              authorization: `Bearer ${await sign(ctx(a))}`,
            }),
          }),
        ],
      });
      const source = await client.income.createSource.mutate({
        name: "New income",
        regularity: "irregular",
        amountKind: "variable",
        startDate: "2026-01-01",
      });
      expect(source.userId).toBe(a);
      const expectation = await client.incomeExpectations.create.mutate({
        sourceId: source.id,
        expectation: { date: "2026-01-15", amount: "100.00" },
      });
      const regular = {
        name: source.name,
        regularity: "regular" as const,
        amountKind: "fixed" as const,
        expectedAmount: "100.00",
        startDate: "2026-01-01",
        schedule: { frequency: "monthly" as const, day: 1 },
      };
      await expect(
        client.income.updateSource.mutate({ id: source.id, source: regular }),
      ).rejects.toMatchObject({ data: { code: "BAD_REQUEST" } });
      expect(
        (await client.income.source.query({ id: source.id })).regularity,
      ).toBe("irregular");
      await client.incomeExpectations.remove.mutate({ id: expectation.id });
      expect(
        (
          await client.income.updateSource.mutate({
            id: source.id,
            source: regular,
          })
        ).regularity,
      ).toBe("regular");
      await client.income.archiveSource.mutate({
        id: source.id,
        at: "2026-01-31T12:00:00.000Z",
      });
      await expect(
        client.income.updateSource.mutate({ id: source.id, source: regular }),
      ).rejects.toMatchObject({ data: { code: "BAD_REQUEST" } });
      const movement = randomUUID();
      await sql`insert into finance."transaction"(id,account_id,booked_at,amount,type,is_internal_movement)
      values (${movement},${accountA},'2026-01-10T12:00:00Z',200,'credit',false)`.execute(
        owner,
      );
      const receipt = await client.incomeReceipts.confirm.mutate({
        transactionId: movement,
        sourceId: source.id,
        at: "2026-01-20T12:00:00.000Z",
      });
      expect(receipt.amount).toBe("200.00");
      const repeat = await client.incomeReceipts.confirm.mutate({
        transactionId: movement,
        sourceId: source.id,
        at: "2026-01-21T12:00:00.000Z",
      });
      expect(repeat.confirmedAt).toBe(receipt.confirmedAt);
      await expect(
        client.incomeReceipts.confirm.mutate({
          transactionId: movement,
          sourceId: sourceB,
          at: "2026-01-20T12:00:00.000Z",
        }),
      ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
      await client.incomeReceipts.clear.mutate({ id: movement });
      await client.incomeReceipts.clear.mutate({ id: movement });
      await expect(
        client.incomeReceipts.clear.mutate({ id: movementB }),
      ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
    });

    it("writes decisions with audit events, preserves manual choices and rejects stale automatic batches", async () => {
      const client = createTRPCClient<PersistenceRouter>({
        links: [
          httpLink({
            url: `${url}/trpc`,
            headers: async () => ({
              authorization: `Bearer ${await sign(ctx(a))}`,
            }),
          }),
        ],
      });
      const name = "New tag " + randomUUID();
      const tag = await client.tags.create.mutate({ name });
      expect((await client.tags.create.mutate({ name })).id).toBe(tag.id);
      const rule = await client.tagRules.create.mutate({
        tagId: tag.id,
        direction: "debit",
        matchField: "merchant",
        matchValue: "cafe",
        autoApply: true,
      });
      expect(
        (
          await client.tagRules.create.mutate({
            tagId: tag.id,
            direction: "debit",
            matchField: "merchant",
            matchValue: "cafe",
            autoApply: true,
          })
        ).id,
      ).toBe(rule.id);
      const movement = randomUUID();
      await sql`insert into finance."transaction"(id,account_id,booked_at,amount,type,is_internal_movement,merchant)
      values (${movement},${accountA},now(),-10,'debit',false,'Cafe')`.execute(
        owner,
      );
      const stale = await client.tagRules.candidates.query({ ruleId: rule.id });
      await client.tagRules.manual.mutate({
        transactionId: movement,
        tagId: tag.id,
      });
      await client.tagRules.manual.mutate({
        transactionId: movement,
        tagId: tag.id,
      });
      await expect(
        client.tagRules.commit.mutate({
          ruleId: rule.id,
          expectedFingerprint: stale.fingerprint,
          decisions: [
            { transactionId: movement, tagId: tag.id, ruleId: rule.id },
          ],
        }),
      ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
      expect(
        (await client.tagRules.facts.query({ id: movement })).movement
          .tagDecisionOrigin,
      ).toBe("manual");
      await client.tagRules.reset.mutate({ id: movement });
      const fresh = await client.tagRules.candidates.query({ ruleId: rule.id });
      expect(
        await client.tagRules.commit.mutate({
          ruleId: rule.id,
          expectedFingerprint: fresh.fingerprint,
          decisions: [
            { transactionId: movement, tagId: tag.id, ruleId: rule.id },
          ],
        }),
      ).toEqual({ changed: 1 });
      const saved = (await client.tagRules.facts.query({ id: movement }))
        .movement;
      expect(saved).toMatchObject({
        tagDecisionOrigin: "rule",
        tagId: tag.id,
        tagRuleId: rule.id,
      });
      await expect(
        client.tagRules.manual.mutate({ transactionId: movement, tagId: tagB }),
      ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
      const { rows } = await sql<{
        kind: string;
      }>`select kind from finance.tag_decision_event where transaction_id=${movement}`.execute(
        owner,
      );
      expect(rows.map((row) => row.kind).sort()).toEqual([
        "manual_tag",
        "reset",
        "rule_applied",
      ]);
    });

    it("rolls back resolver errors AND output-validation failures returned by next()", async () => {
      const client = createTRPCUntypedClient({
        links: [
          httpLink({
            url: `${url}/trpc`,
            headers: async () => ({
              authorization: `Bearer ${await sign(ctx(a))}`,
            }),
          }),
        ],
      });

      for (const method of ["writeThenThrow", "invalidOutput"]) {
        const name = randomUUID();
        await expect(
          client.mutation(`failure.${method}`, { name }),
        ).rejects.toThrow();
        const { rows } =
          await sql`select id from finance.tag where name=${name}`.execute(
            owner,
          );
        expect(rows).toEqual([]);
      }
    });

    it("atomically commits prepared provider facts, checks exact inputs, and keeps tombstones/checkpoints on replay", async () => {
      const client = createTRPCClient<PersistenceRouter>({
        links: [
          httpLink({
            url: `${url}/trpc`,
            methodOverride: "POST",
            headers: async () => ({
              authorization: `Bearer ${await sign(ctx(a))}`,
            }),
          }),
        ],
      });
      const connection = randomUUID();
      await sql`insert into finance.provider_connection(id,user_id,provider_id)
      select ${connection},${a},provider_id from finance.provider_connection where id=${connectionA}`.execute(
        owner,
      );
      const {
        rows: [provider],
      } = await sql<{
        identifier: string;
      }>`select p.identifier from finance.provider p
      join finance.provider_connection c on c.provider_id=p.id where c.id=${connection}`.execute(
        owner,
      );
      const state = await client.providerSync.begin.mutate({
        connectionId: connection,
        provider: provider.identifier,
      });
      const scope = {
        connectionId: connection,
        revision: state.revision,
        keys: [{ accountExternalId: "bank-account", externalId: "purchase" }],
      };
      const facts = await client.providerSync.facts.query(scope);
      const input: CommitProviderSync = {
        scope,
        expectedFingerprint: facts.fingerprint,
        observedAt: "2026-10-15T18:00:00.000Z",
        checkpoint: "first",
        accounts: [
          {
            id: randomUUID(),
            externalId: "bank-account",
            type: "checking",
            currency: "CLP",
            number: null,
            holderName: null,
            balance: "10.00",
            lastSyncedAt: null,
            providerObservedAt: "2026-10-15T18:00:00.000Z",
            historyCompleteness: "unknown",
            historyFrom: null,
            historyThrough: null,
          },
        ],
        movements: [
          {
            id: randomUUID(),
            accountExternalId: "bank-account",
            externalId: "purchase",
            amount: "-2.00",
            type: "debit",
            bookedAt: "2026-10-14T12:00:00.000Z",
            bookedPrecision: "instant",
            bookedOn: null,
            description: "Purchase",
            merchant: "Cafe",
            providerUpdatedAt: null,
            providerObservedAt: "2026-10-15T18:00:00.000Z",
            providerKind: "other",
            relationKind: null,
            relatedAccountExternalId: null,
            relatedMovementExternalId: null,
            counterpartyHolder: null,
            providerInternalAssessment: "external",
          },
        ],
        removals: [],
      };
      await expect(
        client.providerSync.commit.mutate({
          ...input,
          movements: [{ ...input.movements[0], accountExternalId: "unknown" }],
        }),
      ).rejects.toMatchObject({ data: { code: "BAD_REQUEST" } });
      expect((await client.providerSync.facts.query(scope)).accounts).toEqual(
        [],
      );
      expect(await client.providerSync.commit.mutate(input)).toEqual({
        status: "complete",
        conflictCount: 0,
        checkpoint: "first",
      });
      expect(await client.providerSync.commit.mutate(input)).toEqual({
        status: "superseded",
      });
      const nextScope = { ...scope, revision: 1 };
      const next = await client.providerSync.facts.query(nextScope);
      expect(next.movements).toEqual([
        expect.objectContaining({
          id: input.movements[0].id,
          amount: "-2.00",
          isInternalMovement: false,
        }),
      ]);
      await client.tagRules.manual.mutate({
        transactionId: input.movements[0].id,
        tagId: null,
      });
      await expect(
        client.providerSync.commit.mutate({
          ...input,
          scope: nextScope,
          expectedFingerprint: next.fingerprint,
        }),
      ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
      const fresh = await client.providerSync.facts.query(nextScope);
      await client.providerSync.commit.mutate({
        ...input,
        scope: nextScope,
        expectedFingerprint: fresh.fingerprint,
        observedAt: "2026-10-16T18:00:00.000Z",
        checkpoint: "removed",
        accounts: [],
        movements: [],
        removals: [
          {
            ...scope.keys[0],
            reason: "removed",
            observedAt: "2026-10-16T18:00:00.000Z",
            providerUpdatedAt: null,
          },
        ],
      });
      const finalScope = { ...scope, revision: 2 };
      const removed = await client.providerSync.facts.query(finalScope);
      expect(removed.movements[0]).toMatchObject({
        removalReason: "removed",
        tagDecisionOrigin: "manual",
      });
      expect(removed.removals).toHaveLength(1);
      await client.providerSync.commit.mutate({
        ...input,
        scope: finalScope,
        expectedFingerprint: removed.fingerprint,
        observedAt: "2026-10-17T18:00:00.000Z",
        checkpoint: "replayed",
        accounts: [],
      });
      expect(
        (await client.providerSync.facts.query({ ...scope, revision: 3 }))
          .movements[0].removedAt,
      ).not.toBeNull();
      await client.providerSync.failure.mutate({
        connectionId: connection,
        revision: 3,
        reason: "retryable",
        observedAt: "2026-10-18T18:00:00.000Z",
        retryAfter: null,
      });
      expect(
        (await client.providerSync.facts.query({ ...scope, revision: 3 }))
          .state,
      ).toMatchObject({
        checkpoint: "replayed",
        revision: 3,
        lastFailureReason: "retryable",
      });
    });

    it("preserves nested JSON keys across pg, CamelCasePlugin and signed RPC serialization", async () => {
      const value = {
        provider_key: {
          nested_snake_key: "value",
          MixedCaseKey: [{ untouched_key: 1 }],
        },
      };
      await sql`update finance.provider_movement_conflict set incoming_facts=${JSON.stringify(value)}::jsonb
      where transaction_id=${movementA}`.execute(owner);
      const client = createTRPCClient<PersistenceRouter>({
        links: [
          httpLink({
            url: `${url}/trpc`,
            headers: async () => ({
              authorization: `Bearer ${await sign(ctx(a))}`,
            }),
          }),
        ],
      });
      const records = await client.providerSync.review.query();
      expect(
        records.find((row) => row.transactionId === movementA)?.incomingFacts,
      ).toEqual(value);
    });

    it("invalidates prepared rule batches when rules are added or archived between read and commit", async () => {
      const client = createTRPCClient<PersistenceRouter>({
        links: [
          httpLink({
            url: `${url}/trpc`,
            headers: async () => ({
              authorization: `Bearer ${await sign(ctx(a))}`,
            }),
          }),
        ],
      });
      const base = await client.tagRules.create.mutate({
        tagId: tagA,
        direction: "debit",
        matchField: "merchant",
        matchValue: "base rule",
        autoApply: true,
      });
      const beforeInsert = await client.tagRules.candidates.query({
        ruleId: base.id,
      });
      const added = await client.tagRules.create.mutate({
        tagId: tagA,
        direction: "debit",
        matchField: "merchant",
        matchValue: "new rule",
        autoApply: true,
      });
      await expect(
        client.tagRules.commit.mutate({
          ruleId: base.id,
          expectedFingerprint: beforeInsert.fingerprint,
          decisions: [],
        }),
      ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
      const beforeArchive = await client.tagRules.candidates.query({
        ruleId: base.id,
      });
      await client.tagRules.archive.mutate({ id: added.id });
      await expect(
        client.tagRules.commit.mutate({
          ruleId: base.id,
          expectedFingerprint: beforeArchive.fingerprint,
          decisions: [],
        }),
      ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
    });
  },
);
