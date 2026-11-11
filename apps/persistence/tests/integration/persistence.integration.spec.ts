import "reflect-metadata";
import { createHash, generateKeyPairSync, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { PersistenceContext as SignedContext } from "@lazyfinance/contracts/context";
import type {
  CommitProviderSync,
  SaveMcpArtifact,
} from "@lazyfinance/contracts/internal";
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
import {
  CamelCasePlugin,
  type Kysely,
  type QueryExecutorProvider,
  sql,
} from "kysely";
import { Migrator } from "kysely/migration";
import { AppRouterHost, Ctx, Input, Mutation, Router } from "nestjs-trpc";
import { z } from "zod";
import { AppModule } from "../../src/app.module";
import { createDatabase } from "../../src/database/connection";
import { DatabaseModule } from "../../src/database/database.module";
import { up as addGrantCallback } from "../../src/database/migrations/identity/202611110031-mcp-grant-callback";
import { MultiMigrationProvider, migrate } from "../../src/database/migrator";
import {
  assertRuntimeRole,
  provisionRuntime,
} from "../../src/database/provision";
import {
  createRlsDbProxy,
  OutsideRlsSessionError,
  withRequestContext,
} from "../../src/database/rls";
import { RLS_DB } from "../../src/database/tokens";
import { ProviderConnectionRepository } from "../../src/finance/provider-connection/provider-connection.repository";
import { ProviderScheduleRepository } from "../../src/finance/provider-scheduling/provider-schedule.repository";
import { ProviderSelectionRepository } from "../../src/finance/provider-selection/provider-selection.repository";
import { McpAuthorizationRepository } from "../../src/identity/mcp-authorization/mcp-authorization.repository";
import type { McpAuthorizationTables } from "../../src/identity/mcp-authorization/mcp-authorization.tables";
import type { PersistenceRequestContext } from "../../src/rpc/persistence.context";

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
    let owner: Kysely<Record<string, never>>;
    let runtime: Kysely<Record<string, never>>;
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
    const oauthContext = () => ({
      kind: "mcp-authorization" as const,
      requestId: randomUUID(),
    });
    const purposeClient = (identity: SignedContext) =>
      createTRPCClient<PersistenceRouter>({
        links: [
          httpLink({
            url: `${url}/trpc`,
            headers: async () => ({
              authorization: `Bearer ${await sign(identity)}`,
            }),
          }),
        ],
      });
    const hash = (id: string) => createHash("sha256").update(id).digest("hex");
    const bankingFixture = async () => {
      const userId = randomUUID(),
        connectionId = randomUUID();
      await sql`INSERT INTO identity."user"(id,email,name) VALUES (${userId},${`${userId}@example.test`},'Independent banking owner')`.execute(
        owner,
      );
      await sql`INSERT INTO finance.provider_connection(id,user_id,provider_id,mode,external_id,holder_type,institution_id,institution_name,encrypted_credential)
        SELECT ${connectionId},${userId},id,'test',${`link_${randomUUID()}`},'individual','cl_test','Test bank','fixture-ciphertext'
        FROM finance.provider WHERE identifier='fintoc'`.execute(owner);
      const user = purposeClient(ctx(userId));
      const discovered = await user.providerSelection.discover.mutate({
        connectionId,
        expectedCredentialVersion: 0,
        accounts: [
          {
            externalId: "acc_owned",
            name: "Cuenta corriente",
            currency: "CLP",
            numberSuffix: "1234",
            unavailableReason: null,
          },
        ],
      });
      const selection = await user.providerSelection.select.mutate({
        id: connectionId,
        expectedVersion: 0,
        discoveryVersion: discovered.discoveryVersion,
        accountIds: ["acc_owned"],
        automaticEnrolled: true,
      });
      return {
        userId,
        connectionId,
        user,
        selection,
        begin: {
          connectionId,
          provider: "fintoc",
          expectedCredentialVersion: 0,
          expectedSelectionVersion: selection.version,
        },
      };
    };
    const pauseBanking = async (connectionIds: string[]) => {
      if (!connectionIds.length) return;
      await sql`UPDATE finance.provider_sync_schedule SET eligible=false,next_attempt_at=NULL,
        claim_id=NULL,claim_expires_at=NULL,run_revision=NULL WHERE connection_id IN (${sql.join(connectionIds)})`.execute(
        owner,
      );
      await sql`UPDATE finance.provider_sync_state SET lease_expires_at=NULL WHERE provider_connection_id IN (${sql.join(connectionIds)})`.execute(
        owner,
      );
    };
    const gate = () => {
      let resolve!: () => void;
      let reject!: (reason: unknown) => void;
      const promise = new Promise<void>((yes, no) => {
        resolve = yes;
        reject = no;
      });
      return { promise, resolve, reject };
    };
    const artifactKey = ({ model, key }: SaveMcpArtifact) => ({ model, key });
    const oauthArtifact = (
      overrides: Partial<SaveMcpArtifact> = {},
    ): SaveMcpArtifact => ({
      model: "Interaction",
      key: hash(randomUUID()),
      ciphertext: "fixture-encrypted-payload",
      expiresIn: 600,
      grantId: null,
      accountId: null,
      clientId: null,
      uidHash: null,
      ...overrides,
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
        await sql`insert into finance.budget_revision(id,objective_id,version,name,amount,kind,effective_from)
          values (${objective},${objective},1,'Initial',1,'amount_based',now())`.execute(
          owner,
        );
        await sql`insert into finance.budget_revision_tag(revision_id,tag_id) values (${objective},${tag})`.execute(
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
      expect(expected).toHaveLength(105);

      for (const name of expected)
        expect(procedures[name]._def.meta).toMatchObject({
          context:
            name === "identity.resolve"
              ? "identity-bootstrap"
              : name.startsWith("mcpArtifacts.")
                ? "mcp-authorization"
                : name.startsWith("providerScheduler.")
                  ? "banking-scheduler"
                  : name.startsWith("providerRequests.")
                    ? "banking-transport"
                    : "user",
        });
    });

    it("migrates idempotently and enables/forces RLS on all 32 sensitive tables", async () => {
      expect(await migrate(owner, migrationProvider())).toEqual([]);
      const { rows } = await sql<{
        relrowsecurity: boolean;
        relforcerowsecurity: boolean;
      }>`select relrowsecurity, relforcerowsecurity
      from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('identity','finance','assistant') and c.relkind='r' and c.relname != 'provider'`.execute(
        owner,
      );
      expect(rows).toHaveLength(32);
      expect(
        rows.every((row) => row.relrowsecurity && row.relforcerowsecurity),
      ).toBe(true);
    });

    it("isolates scheduler and transport purposes from user finance and each other", async () => {
      const scheduler = purposeClient({
        kind: "banking-scheduler",
        requestId: randomUUID(),
      });
      const transport = purposeClient({
        kind: "banking-transport",
        requestId: randomUUID(),
      });
      const user = purposeClient(ctx(a));
      for (const work of [
        () => scheduler.accounts.listActive.query(),
        () => scheduler.providerLinks.connection.query({ id: connectionA }),
        () => scheduler.providerSelection.get.query({ id: connectionA }),
        () =>
          scheduler.providerRequests.acquire.mutate({
            id: randomUUID(),
            mode: "test",
            purpose: "sync",
          }),
        () => transport.providerScheduler.claim.mutate({ mode: "test" }),
        () => transport.accounts.listActive.query(),
        () => user.providerScheduler.claim.mutate({ mode: "test" }),
        () =>
          user.providerRequests.acquire.mutate({
            id: randomUUID(),
            mode: "test",
            purpose: "sync",
          }),
      ])
        await expect(work()).rejects.toMatchObject({
          data: { code: "FORBIDDEN" },
        });
      for (const kind of ["banking-scheduler", "banking-transport"] as const) {
        await withRequestContext(
          runtime,
          { kind, requestId: randomUUID() },
          async (tx) => {
            const result = await sql<{
              count: number;
            }>`select count(*)::int as count from finance.account`.execute(tx);
            expect(result.rows[0].count).toBe(0);
          },
        );
      }
    });

    it("shares durable provider admission across callers and reserves lifecycle capacity separately from read quota", async () => {
      const transport = purposeClient({
        kind: "banking-transport",
        requestId: randomUUID(),
      });
      const ids: string[] = [];
      try {
        const first = randomUUID(),
          second = randomUUID();
        ids.push(first, second);
        const permits = await Promise.all(
          [first, second].map((id) =>
            transport.providerRequests.acquire.mutate({
              id,
              mode: "test",
              purpose: "sync",
            }),
          ),
        );
        expect(permits.every((permit) => permit.acquired)).toBe(true);
        expect(
          await transport.providerRequests.acquire.mutate({
            id: randomUUID(),
            mode: "test",
            purpose: "sync",
          }),
        ).toMatchObject({ acquired: false });
        await Promise.all(
          ids.map((id) => transport.providerRequests.release.mutate({ id })),
        );
        const seeded = await sql<{
          id: string;
        }>`INSERT INTO finance.provider_request_admission(id,mode,purpose,started_at,expires_at,finished_at)
          SELECT gen_random_uuid(),'test','sync',now()-interval '2 minutes',now()-interval '100 seconds',now()-interval '110 seconds' FROM generate_series(1,1000) RETURNING id`.execute(
          owner,
        );
        ids.push(...seeded.rows.map((row) => row.id));
        const limited = await transport.providerRequests.acquire.mutate({
          id: randomUUID(),
          mode: "test",
          purpose: "sync",
        });
        expect(limited).toMatchObject({ acquired: false });
        if (!limited.acquired)
          expect(Date.parse(limited.retryAt)).toBeGreaterThan(
            Date.now() + 50 * 60_000,
          );
        // Release does not erase quota history, and foreground lifecycle calls
        // are subject to shared rate/concurrency but not the read-volume cap.
        await sql`UPDATE finance.provider_request_admission SET started_at=now()-interval '2 minutes',expires_at=now()-interval '100 seconds' WHERE id IN (${sql.join([first, second])})`.execute(
          owner,
        );
        const lifecycle = randomUUID();
        ids.push(lifecycle);
        expect(
          await transport.providerRequests.acquire.mutate({
            id: lifecycle,
            mode: "test",
            purpose: "lifecycle",
          }),
        ).toMatchObject({ acquired: true });
      } finally {
        if (ids.length)
          await sql`DELETE FROM finance.provider_request_admission WHERE id IN (${sql.join(ids)})`.execute(
            owner,
          );
      }
    });

    it("claims only enrolled server-owned work and rejects late selection-bound runs", async () => {
      const connectionId = randomUUID();
      const syncUserId = randomUUID();
      await sql`INSERT INTO identity."user"(id,email,name) VALUES (${syncUserId},${`${syncUserId}@example.test`},'Banking test owner')`.execute(
        owner,
      );
      await sql`INSERT INTO finance.provider_connection(id,user_id,provider_id,mode,external_id,holder_type,institution_id,institution_name,encrypted_credential)
        SELECT ${connectionId},${syncUserId},id,'test',${`link_${randomUUID()}`},'individual','cl_test','Test bank','fixture-ciphertext'
        FROM finance.provider WHERE identifier='fintoc'`.execute(owner);
      const user = purposeClient(ctx(syncUserId));
      const scheduler = purposeClient({
        kind: "banking-scheduler",
        requestId: randomUUID(),
      });
      const discovered = await user.providerSelection.discover.mutate({
        connectionId,
        expectedCredentialVersion: 0,
        accounts: [
          {
            externalId: "acc_owned",
            name: "Cuenta corriente",
            currency: "CLP",
            numberSuffix: "1234",
            unavailableReason: null,
          },
        ],
      });
      const selected = await user.providerSelection.select.mutate({
        id: connectionId,
        expectedVersion: 0,
        discoveryVersion: discovered.discoveryVersion,
        accountIds: ["acc_owned"],
        automaticEnrolled: true,
      });
      const claim = await scheduler.providerScheduler.claim.mutate({
        mode: "test",
      });
      expect(claim).toMatchObject({
        connectionId,
        userId: syncUserId,
        selectionVersion: selected.version,
      });
      expect(
        await scheduler.providerScheduler.claim.mutate({ mode: "test" }),
      ).toBeNull();
      if (!claim) throw new Error("Missing work claim");
      const run = await user.providerSync.begin.mutate({
        connectionId,
        provider: "fintoc",
        expectedCredentialVersion: 0,
        expectedSelectionVersion: selected.version,
        claimId: claim.id,
      });
      expect(run.acquired).toBe(true);
      await expect(
        withRequestContext(
          runtime,
          { kind: "banking-scheduler", requestId: randomUUID() },
          async (tx) => {
            await sql`UPDATE finance.provider_sync_schedule SET eligible=false WHERE connection_id=${connectionId}`.execute(
              tx,
            );
          },
        ),
      ).rejects.toMatchObject({ code: "42501" });
      await user.providerSelection.select.mutate({
        id: connectionId,
        expectedVersion: selected.version,
        discoveryVersion: selected.discoveryVersion,
        accountIds: [],
        automaticEnrolled: true,
      });
      await expect(
        user.providerSync.facts.query({
          connectionId,
          revision: run.revision,
          keys: [],
        }),
      ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
      expect(
        await scheduler.providerScheduler.claim.mutate({ mode: "test" }),
      ).toBeNull();
      expect(
        await user.providerSync.failure.mutate({
          connectionId,
          revision: run.revision,
          reason: "invalid_data",
          observedAt: new Date().toISOString(),
          retryAfter: null,
          scheduling: { nextAttemptAt: null, expectedFailureCount: 0 },
        }),
      ).toEqual({ status: "superseded" });
    });

    it("defers the oldest exhausted daily budget and immediately admits healthy due work", async () => {
      const connections: string[] = [];
      try {
        const exhausted = await bankingFixture();
        connections.push(exhausted.connectionId);
        const healthy = await bankingFixture();
        connections.push(healthy.connectionId);
        const oldest = new Date(Date.now() - 23 * 60 * 60_000);
        // Deliberately unsorted: the earliest rolling-window attempt determines eligibility.
        const attempts = [
          new Date(oldest.getTime() + 60_000),
          oldest,
          ...Array.from(
            { length: 28 },
            (_, i) => new Date(oldest.getTime() + (i + 2) * 60_000),
          ),
        ];
        await sql`UPDATE finance.provider_sync_schedule SET attempts=${attempts},next_attempt_at=now()-interval '2 hours'
          WHERE connection_id=${exhausted.connectionId}`.execute(owner);
        await sql`UPDATE finance.provider_sync_schedule SET next_attempt_at=now()-interval '1 hour'
          WHERE connection_id=${healthy.connectionId}`.execute(owner);
        await sql`INSERT INTO finance.provider_sync_state(provider_connection_id,revision) VALUES (${exhausted.connectionId},7)`.execute(
          owner,
        );
        const scheduler = purposeClient({
          kind: "banking-scheduler",
          requestId: randomUUID(),
        });
        const claim = await scheduler.providerScheduler.claim.mutate({
          mode: "test",
        });
        expect(claim).toMatchObject({ connectionId: exhausted.connectionId });
        if (!claim) throw new Error("Missing exhausted claim");
        const before = (
          await sql`SELECT * FROM finance.provider_sync_state WHERE provider_connection_id=${exhausted.connectionId}`.execute(
            owner,
          )
        ).rows;
        const retryAt = new Date(oldest.getTime() + 24 * 60 * 60_000);
        expect(
          await exhausted.user.providerSync.begin.mutate({
            ...exhausted.begin,
            claimId: claim.id,
          }),
        ).toMatchObject({
          acquired: false,
          revision: 7,
          retryAfter: retryAt.toISOString(),
        });
        const schedule = (
          await sql<{
            nextAttemptAt: Date;
            claimId: string | null;
            claimExpiresAt: Date | null;
            runRevision: number | null;
            attempts: Date[];
          }>`SELECT next_attempt_at AS "nextAttemptAt",claim_id AS "claimId",claim_expires_at AS "claimExpiresAt",run_revision AS "runRevision",attempts FROM finance.provider_sync_schedule WHERE connection_id=${exhausted.connectionId}`.execute(
            owner,
          )
        ).rows[0];
        expect(schedule).toMatchObject({
          nextAttemptAt: retryAt,
          claimId: null,
          claimExpiresAt: null,
          runRevision: null,
          attempts,
        });
        expect(
          (
            await sql`SELECT * FROM finance.provider_sync_state WHERE provider_connection_id=${exhausted.connectionId}`.execute(
              owner,
            )
          ).rows,
        ).toEqual(before);
        const next = await scheduler.providerScheduler.claim.mutate({
          mode: "test",
        });
        expect(next).toMatchObject({ connectionId: healthy.connectionId });
        if (!next) throw new Error("Missing healthy claim");
        expect(
          await healthy.user.providerSync.begin.mutate({
            ...healthy.begin,
            claimId: next.id,
          }),
        ).toMatchObject({ acquired: true });
      } finally {
        await pauseBanking(connections);
      }
    });

    it.each([
      "manual begin",
      "deselection",
    ] as const)("skips an owner-locked due row during %s without overwriting its transition", async (transition) => {
      const connections: string[] = [];
      const held = gate(),
        release = gate();
      let holding: Promise<unknown> | undefined;
      try {
        const locked = await bankingFixture();
        connections.push(locked.connectionId);
        const healthy = await bankingFixture();
        connections.push(healthy.connectionId);
        await sql`UPDATE finance.provider_sync_schedule SET next_attempt_at=now()-interval '2 hours' WHERE connection_id=${locked.connectionId}`.execute(
          owner,
        );
        await sql`UPDATE finance.provider_sync_schedule SET next_attempt_at=now()-interval '1 hour' WHERE connection_id=${healthy.connectionId}`.execute(
          owner,
        );
        holding = withRequestContext(
          runtime.withPlugin(new CamelCasePlugin()),
          ctx(locked.userId),
          async (tx) => {
            await sql`select pg_advisory_xact_lock(hashtextextended(${`lazyfinance:user:${locked.userId}`},0))`.execute(
              tx,
            );
            if (transition === "manual begin") {
              expect(
                await app.get(ProviderConnectionRepository).begin(locked.begin),
              ).toMatchObject({ acquired: true });
            } else {
              await app.get(ProviderSelectionRepository).select({
                id: locked.connectionId,
                expectedVersion: locked.selection.version,
                discoveryVersion: locked.selection.discoveryVersion,
                accountIds: [],
                automaticEnrolled: false,
              });
            }
            // The old committed tuple is still due; only SKIP LOCKED can avoid claiming it.
            held.resolve();
            await release.promise;
          },
        );
        void holding.catch(held.reject);
        await held.promise;
        const scheduler = purposeClient({
          kind: "banking-scheduler",
          requestId: randomUUID(),
        });
        expect(
          await scheduler.providerScheduler.claim.mutate({ mode: "test" }),
        ).toMatchObject({ connectionId: healthy.connectionId });
        release.resolve();
        await holding;
        const row = (
          await sql<{
            claimId: string | null;
            eligible: boolean;
            runRevision: number | null;
            nextAttemptAt: Date | null;
          }>`SELECT claim_id AS "claimId",eligible,run_revision AS "runRevision",next_attempt_at AS "nextAttemptAt" FROM finance.provider_sync_schedule WHERE connection_id=${locked.connectionId}`.execute(
            owner,
          )
        ).rows[0];
        expect(row.claimId).toBeNull();
        if (transition === "manual begin") {
          expect(row).toMatchObject({ eligible: true, runRevision: 0 });
          expect(row.nextAttemptAt?.getTime() ?? 0).toBeGreaterThan(Date.now());
          expect(
            await locked.user.providerSync.facts.query({
              connectionId: locked.connectionId,
              revision: 0,
              keys: [],
            }),
          ).toMatchObject({ state: { revision: 0 } });
        } else {
          expect(row).toMatchObject({
            eligible: false,
            runRevision: null,
            nextAttemptAt: null,
          });
          expect(
            await locked.user.providerSelection.get.query({
              id: locked.connectionId,
            }),
          ).toMatchObject({
            selection: { accountIds: [], automaticEnrolled: false },
          });
        }
      } finally {
        release.resolve();
        await holding?.catch(() => {});
        await pauseBanking(connections);
      }
    });

    it("serializes scheduled begin extension with global capacity checks across an expired committed claim", async () => {
      const connections: string[] = [];
      const held = gate(),
        release = gate();
      let holding: Promise<unknown> | undefined;
      try {
        const extending = await bankingFixture();
        connections.push(extending.connectionId);
        const healthy = await bankingFixture();
        connections.push(healthy.connectionId);
        await sql`UPDATE finance.provider_sync_schedule SET next_attempt_at=now()-interval '2 hours' WHERE connection_id=${extending.connectionId}`.execute(
          owner,
        );
        await sql`UPDATE finance.provider_sync_schedule SET next_attempt_at=now()-interval '1 hour' WHERE connection_id=${healthy.connectionId}`.execute(
          owner,
        );
        const scheduler = purposeClient({
          kind: "banking-scheduler",
          requestId: randomUUID(),
        });
        const claim = await scheduler.providerScheduler.claim.mutate({
          mode: "test",
        });
        expect(claim).toMatchObject({ connectionId: extending.connectionId });
        if (!claim) throw new Error("Missing extending claim");
        const originalExpiry = new Date(Date.now() - 1000);
        await sql`UPDATE finance.provider_sync_schedule SET claim_expires_at=${originalExpiry} WHERE connection_id=${extending.connectionId}`.execute(
          owner,
        );
        holding = withRequestContext(
          runtime.withPlugin(new CamelCasePlugin()),
          ctx(extending.userId),
          async (tx) => {
            await sql`select pg_advisory_xact_lock(hashtextextended(${`lazyfinance:user:${extending.userId}`},0))`.execute(
              tx,
            );
            // Only the direct repository call sees an instant before expiry.
            // Other sessions see the committed, already-expired tuple while
            // this transaction holds its uncommitted future extension.
            vi.useFakeTimers({ toFake: ["Date"] });
            try {
              vi.setSystemTime(originalExpiry.getTime() - 1000);
              expect(
                await app.get(ProviderConnectionRepository).begin({
                  ...extending.begin,
                  claimId: claim.id,
                }),
              ).toMatchObject({ acquired: true });
            } finally {
              vi.useRealTimers();
            }
            held.resolve();
            await release.promise;
          },
        );
        void holding.catch(held.reject);
        await held.promise;
        const committed = (
          await sql<{
            claimExpiresAt: Date;
          }>`SELECT claim_expires_at AS "claimExpiresAt" FROM finance.provider_sync_schedule WHERE connection_id=${extending.connectionId}`.execute(
            owner,
          )
        ).rows[0];
        expect(committed.claimExpiresAt).toEqual(originalExpiry);
        expect(committed.claimExpiresAt.getTime()).toBeLessThan(Date.now());
        const probe = await withRequestContext(
          runtime,
          { kind: "banking-scheduler", requestId: randomUUID() },
          (tx) =>
            sql<{
              acquired: boolean;
            }>`SELECT pg_try_advisory_xact_lock(hashtextextended('lazyfinance:banking-scheduler',0)) AS acquired`.execute(
              tx,
            ),
        );
        expect(probe.rows[0].acquired).toBe(false);
        const nextClaim = scheduler.providerScheduler.claim.mutate({
          mode: "test",
        });
        release.resolve();
        await holding;
        expect(await nextClaim).toBeNull();
        const active = await sql<{
          count: number;
        }>`SELECT count(*)::int AS count FROM finance.provider_sync_schedule WHERE claim_expires_at > clock_timestamp()`.execute(
          owner,
        );
        expect(active.rows[0].count).toBe(1);
      } finally {
        vi.useRealTimers();
        release.resolve();
        await holding?.catch(() => {});
        await pauseBanking(connections);
      }
    });

    it("aligns claim and ingestion expiry and rejects old failures after claim replacement without changing state", async () => {
      const connections: string[] = [];
      try {
        const f = await bankingFixture();
        connections.push(f.connectionId);
        const scheduler = purposeClient({
          kind: "banking-scheduler",
          requestId: randomUUID(),
        });
        const claim = await scheduler.providerScheduler.claim.mutate({
          mode: "test",
        });
        if (!claim) throw new Error("Missing original claim");
        expect(claim.connectionId).toBe(f.connectionId);
        await sql`UPDATE finance.provider_sync_schedule SET claim_expires_at=now()+interval '1 minute' WHERE connection_id=${f.connectionId}`.execute(
          owner,
        );
        const run = await f.user.providerSync.begin.mutate({
          ...f.begin,
          claimId: claim.id,
        });
        expect(run.acquired).toBe(true);
        const aligned = (
          await sql<{
            claimExpiresAt: Date;
          }>`SELECT claim_expires_at AS "claimExpiresAt" FROM finance.provider_sync_schedule WHERE connection_id=${f.connectionId}`.execute(
            owner,
          )
        ).rows[0];
        expect(aligned.claimExpiresAt.toISOString()).toBe(run.leaseExpiresAt);
        // Model legacy/poisoned expiry independently of the still-live ingestion lease.
        await sql`UPDATE finance.provider_sync_schedule SET claim_expires_at=now()-interval '1 second',next_attempt_at=now()-interval '1 second'
          WHERE connection_id=${f.connectionId}`.execute(owner);
        const replacement = await scheduler.providerScheduler.claim.mutate({
          mode: "test",
        });
        expect(replacement).toMatchObject({ connectionId: f.connectionId });
        if (!replacement) throw new Error("Missing replacement claim");
        expect(replacement.id).not.toBe(claim.id);
        const before =
          await sql`SELECT row_to_json(s) AS schedule,row_to_json(r) AS state,row_to_json(c) AS connection
          FROM finance.provider_sync_schedule s JOIN finance.provider_sync_state r ON r.provider_connection_id=s.connection_id
          JOIN finance.provider_connection c ON c.id=s.connection_id WHERE s.connection_id=${f.connectionId}`.execute(
            owner,
          );
        for (const reason of [
          "retryable",
          "revoked",
          "invalid_data",
        ] as const) {
          const retryAfter =
            reason === "retryable"
              ? new Date(Date.now() + 60 * 60_000).toISOString()
              : null;
          expect(
            await f.user.providerSync.failure.mutate({
              connectionId: f.connectionId,
              revision: run.revision,
              reason,
              observedAt: new Date().toISOString(),
              retryAfter,
              scheduling: {
                expectedFailureCount: 0,
                nextAttemptAt: retryAfter,
              },
            }),
          ).toEqual({ status: "superseded" });
        }
        await expect(
          withRequestContext(
            runtime.withPlugin(new CamelCasePlugin()),
            ctx(f.userId),
            () =>
              app.get(ProviderScheduleRepository).finish(
                f.connectionId,
                run.revision,
                claim.id,
                {
                  expectedFailureCount: 0,
                  nextAttemptAt: new Date(
                    Date.now() + 60 * 60_000,
                  ).toISOString(),
                },
                "retryable",
              ),
          ),
        ).rejects.toMatchObject({ code: "CONFLICT" });
        expect(
          (
            await sql`SELECT row_to_json(s) AS schedule,row_to_json(r) AS state,row_to_json(c) AS connection
          FROM finance.provider_sync_schedule s JOIN finance.provider_sync_state r ON r.provider_connection_id=s.connection_id
          JOIN finance.provider_connection c ON c.id=s.connection_id WHERE s.connection_id=${f.connectionId}`.execute(
              owner,
            )
          ).rows,
        ).toEqual(before.rows);
        expect(
          await scheduler.providerScheduler.claim.mutate({ mode: "test" }),
        ).toBeNull();
      } finally {
        await pauseBanking(connections);
      }
    });

    it("persists greatest mode-specific transport backoff across clients without purpose or lifecycle bypass", async () => {
      const transport = () =>
        purposeClient({ kind: "banking-transport", requestId: randomUUID() });
      const first = new Date(Date.now() + 60 * 60_000).toISOString();
      const later = new Date(Date.now() + 2 * 60 * 60_000).toISOString();
      const earlier = new Date(Date.now() + 30 * 60_000).toISOString();
      const admissions: string[] = [];
      let created = false;
      expect(
        (
          await sql`SELECT * FROM finance.provider_request_backoff`.execute(
            owner,
          )
        ).rows,
      ).toEqual([]);
      try {
        created = true;
        await transport().providerRequests.defer.mutate({
          mode: "test",
          retryAfter: first,
        });
        await Promise.all(
          [later, earlier].map((retryAfter) =>
            transport().providerRequests.defer.mutate({
              mode: "test",
              retryAfter,
            }),
          ),
        );
        await transport().providerRequests.defer.mutate({
          mode: "test",
          retryAfter: earlier,
        });
        expect(
          (
            await sql<{
              retryAfter: Date;
            }>`SELECT retry_after AS "retryAfter" FROM finance.provider_request_backoff WHERE mode='test'`.execute(
              owner,
            )
          ).rows[0].retryAfter.toISOString(),
        ).toBe(later);
        for (const purpose of ["sync", "lifecycle"] as const) {
          const id = randomUUID();
          admissions.push(id);
          expect(
            await transport().providerRequests.acquire.mutate({
              id,
              mode: "test",
              purpose,
            }),
          ).toEqual({ acquired: false, retryAt: later });
        }
        expect(
          (
            await sql`SELECT id FROM finance.provider_request_admission WHERE id IN (${sql.join(admissions)})`.execute(
              owner,
            )
          ).rows,
        ).toEqual([]);
        const live = randomUUID();
        admissions.push(live);
        expect(
          await transport().providerRequests.acquire.mutate({
            id: live,
            mode: "live",
            purpose: "sync",
          }),
        ).toMatchObject({ acquired: true });
        await transport().providerRequests.release.mutate({ id: live });
        // Release cannot clear the backoff or its durable record.
        const afterRelease = randomUUID();
        admissions.push(afterRelease);
        expect(
          await transport().providerRequests.acquire.mutate({
            id: afterRelease,
            mode: "test",
            purpose: "sync",
          }),
        ).toEqual({ acquired: false, retryAt: later });
        for (const identity of [
          ctx(a),
          { kind: "banking-scheduler" as const, requestId: randomUUID() },
          oauthContext(),
        ]) {
          // User/scheduler/OAuth purposes must neither read operational waiting state nor shorten it.
          await expect(
            purposeClient(identity).providerRequests.defer.mutate({
              mode: "test",
              retryAfter: earlier,
            }),
          ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
          await withRequestContext(runtime, identity, async (tx) => {
            expect(
              (
                await sql`SELECT * FROM finance.provider_request_backoff`.execute(
                  tx,
                )
              ).rows,
            ).toEqual([]);
            expect(
              (
                await sql`UPDATE finance.provider_request_backoff SET retry_after=now() WHERE mode='test' RETURNING mode`.execute(
                  tx,
                )
              ).rows,
            ).toEqual([]);
          });
          await expect(
            withRequestContext(runtime, identity, (tx) =>
              sql`INSERT INTO finance.provider_request_backoff(mode,retry_after) VALUES ('live',now())`.execute(
                tx,
              ),
            ),
          ).rejects.toMatchObject({ code: "42501" });
        }
        await expect(
          withRequestContext(
            runtime,
            { kind: "banking-transport", requestId: randomUUID() },
            (tx) =>
              sql`DELETE FROM finance.provider_request_backoff WHERE mode='test'`.execute(
                tx,
              ),
          ),
        ).rejects.toMatchObject({ code: "42501" });
        await expect(
          withRequestContext(
            runtime,
            { kind: "banking-transport", requestId: randomUUID() },
            (tx) =>
              sql`UPDATE finance.provider_request_backoff SET mode='live' WHERE mode='test'`.execute(
                tx,
              ),
          ),
        ).rejects.toMatchObject({ code: "42501" });
        const afterDeniedWrites = randomUUID();
        admissions.push(afterDeniedWrites);
        expect(
          await transport().providerRequests.acquire.mutate({
            id: afterDeniedWrites,
            mode: "test",
            purpose: "lifecycle",
          }),
        ).toEqual({ acquired: false, retryAt: later });
        // Expiry restores admission without deleting history or a time-based sleep.
        await sql`UPDATE finance.provider_request_backoff SET retry_after=now()-interval '1 second' WHERE mode='test'`.execute(
          owner,
        );
        const resumed = randomUUID();
        admissions.push(resumed);
        expect(
          await transport().providerRequests.acquire.mutate({
            id: resumed,
            mode: "test",
            purpose: "sync",
          }),
        ).toMatchObject({ acquired: true });
        await transport().providerRequests.release.mutate({ id: resumed });
      } finally {
        if (created)
          await sql`DELETE FROM finance.provider_request_backoff WHERE mode='test'`.execute(
            owner,
          );
        if (admissions.length)
          await sql`DELETE FROM finance.provider_request_admission WHERE id IN (${sql.join(admissions)})`.execute(
            owner,
          );
      }
    });

    it("admits OAuth state only for the dedicated purpose, with no financial or identity-bootstrap authority", async () => {
      const state = purposeClient(oauthContext()),
        user = purposeClient(ctx(a));
      for (const work of [
        () => state.accounts.listActive.query(),
        () => state.onboarding.state.query(),
        () => state.identity.resolve.mutate({ mode: "existing" }),
        () => state.mcpGrants.list.query(),
        () => state.assistantConversations.list.query(),
        () =>
          user.mcpArtifacts.find.query({
            model: "Client",
            key: hash("unknown"),
            byUid: false,
          }),
      ])
        await expect(work()).rejects.toMatchObject({
          data: { code: "FORBIDDEN" },
        });

      await withRequestContext(runtime, oauthContext(), async (tx) => {
        const { rows: tables } = await sql<{
          schema: string;
          name: string;
        }>`select n.nspname as schema,c.relname as name
          from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r'
          and n.nspname in ('identity','finance','assistant') and c.relname not in ('provider','external_identity','mcp_artifact','mcp_grant')`.execute(
          tx,
        );
        for (const table of tables) {
          const result =
            await sql`select * from ${sql.id(table.schema, table.name)}`.execute(
              tx,
            );
          expect(result.rows, `${table.schema}.${table.name}`).toEqual([]);
        }
      });
      await expect(
        withRequestContext(runtime, oauthContext(), (tx) =>
          sql`select * from identity.external_identity`.execute(tx),
        ),
      ).rejects.toThrow(/permission denied/);
      await expect(
        withRequestContext(runtime, oauthContext(), (tx) =>
          sql`select * from identity.resolve_external_identity(
        'mock','https://mock.lazyfinance.cl','untrusted',null,null,false)`.execute(
            tx,
          ),
        ),
      ).rejects.toThrow(/bootstrap|context|permission/i);
    });

    it("binds immutable grants only to the matching provider artifact and owner, then revokes monotonically without touching finances", async () => {
      const state = purposeClient(oauthContext()),
        user = purposeClient(ctx(a)),
        other = purposeClient(ctx(b));
      const id = randomUUID(),
        record = oauthArtifact({
          model: "Grant",
          key: hash(id),
          grantId: id,
          accountId: a,
          clientId: "fixture-client",
        });
      expect(await state.mcpArtifacts.save.mutate(record)).toEqual({
        saved: true,
      });
      expect(await state.mcpArtifacts.identity.query({ id })).toBeNull();
      const input = {
        id,
        key: record.key,
        interactionId: randomUUID(),
        clientId: "fixture-client",
        clientName: "Fixture client",
        resource: "https://api.example/mcp",
        scopes: ["finance:read" as const],
      };
      await expect(other.mcpGrants.bind.mutate(input)).rejects.toMatchObject({
        data: { code: "FORBIDDEN" },
      });
      await expect(
        user.mcpGrants.bind.mutate({ ...input, clientId: "foreign-client" }),
      ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
      const grant = await user.mcpGrants.bind.mutate(input);
      expect(grant.redirectUri).toBeNull();
      expect((await state.mcpArtifacts.identity.query({ id }))?.userId).toBe(a);
      expect(
        (await other.mcpGrants.list.query()).some((row) => row.id === id),
      ).toBe(false);
      expect(await other.mcpGrants.revoke.mutate({ id })).toEqual({
        revoked: false,
      });
      await expect(user.mcpGrants.bind.mutate(input)).rejects.toMatchObject({
        data: { code: "CONFLICT" },
      });
      await expect(
        withRequestContext(runtime, ctx(a), (tx) =>
          sql`update identity.mcp_grant set user_id=${b} where id=${id}`.execute(
            tx,
          ),
        ),
      ).rejects.toThrow(/permission denied/);
      const before = await user.accounts.listActive.query();
      expect(await user.mcpGrants.revoke.mutate({ id })).toEqual({
        revoked: true,
      });
      const revokedAt = (await user.mcpGrants.list.query()).find(
        (row) => row.id === id,
      )?.revokedAt;
      await withRequestContext(runtime, ctx(a), (tx) =>
        sql`update identity.mcp_grant set revoked_at=null where id=${id}`.execute(
          tx,
        ),
      );
      expect(
        (await user.mcpGrants.list.query()).find((row) => row.id === id)
          ?.revokedAt,
      ).toBe(revokedAt);
      expect(await state.mcpArtifacts.save.mutate(record)).toEqual({
        saved: false,
      });
      expect(await state.mcpArtifacts.identity.query({ id })).toBeNull();
      expect(await user.accounts.listActive.query()).toEqual(before);
      expect(Date.parse(grant.expiresAt) - Date.parse(grant.createdAt)).toBe(
        30 * 24 * 60 * 60 * 1000,
      );
    });

    it("preserves consumption across upserts and rejects concurrent decisions and JWT replay atomically", async () => {
      const state = purposeClient(oauthContext()),
        record = oauthArtifact();
      await state.mcpArtifacts.save.mutate(record);
      const attempts = await Promise.all(
        Array.from({ length: 8 }, () =>
          state.mcpArtifacts.consume.mutate(artifactKey(record)),
        ),
      );
      expect(attempts.filter((result) => result.consumed)).toHaveLength(1);
      await state.mcpArtifacts.save.mutate(record);
      expect(
        (
          await state.mcpArtifacts.find.query({
            ...artifactKey(record),
            byUid: false,
          })
        )?.consumedAt,
      ).not.toBeNull();
      expect(
        await state.mcpArtifacts.consume.mutate(artifactKey(record)),
      ).toEqual({ consumed: false });
      const jwt = oauthArtifact({ model: "ReplayDetection" });
      const replay = await Promise.all(
        Array.from({ length: 8 }, () => state.mcpArtifacts.save.mutate(jwt)),
      );
      expect(replay.filter((result) => result.saved)).toHaveLength(1);
    });

    it("commits family revocation on concurrent credential replay and refuses token resurrection", async () => {
      const state = purposeClient(oauthContext()),
        user = purposeClient(ctx(a));
      const id = randomUUID(),
        grantArtifact = oauthArtifact({
          model: "Grant",
          key: hash(id),
          grantId: id,
          accountId: a,
          clientId: "replay-client",
        });
      await state.mcpArtifacts.save.mutate(grantArtifact);
      await user.mcpGrants.bind.mutate({
        id,
        key: hash(id),
        interactionId: randomUUID(),
        clientId: "replay-client",
        clientName: "Replay fixture",
        resource: "https://api.example/mcp",
        scopes: ["finance:read"],
      });
      const refresh = oauthArtifact({
        model: "RefreshToken",
        grantId: id,
        accountId: a,
        clientId: "replay-client",
      });
      await state.mcpArtifacts.save.mutate(refresh);
      const results = await Promise.all([
        state.mcpArtifacts.consume.mutate(artifactKey(refresh)),
        state.mcpArtifacts.consume.mutate(artifactKey(refresh)),
      ]);
      expect(results.filter((result) => result.consumed)).toHaveLength(1);
      expect(await state.mcpArtifacts.identity.query({ id })).toBeNull();
      expect(
        (await user.mcpGrants.list.query()).find((row) => row.id === id)
          ?.revokedAt,
      ).toEqual(expect.any(String));
      expect(
        await state.mcpArtifacts.save.mutate({
          ...refresh,
          key: hash(randomUUID()),
        }),
      ).toEqual({ saved: false });
    });

    it("adds callback history without rewriting retained grant facts", async () => {
      // Probe the previous shape in a rolled-back transaction on this disposable
      // database; never downgrade the actual migration ledger.
      const rollback = new Error("rollback migration probe");
      await expect(
        owner.transaction().execute(async (tx) => {
          await sql`alter table identity.mcp_grant drop column redirect_uri`.execute(
            tx,
          );
          const before = await sql<
            Record<string, unknown>
          >`select * from identity.mcp_grant order by id`.execute(tx);
          expect(before.rows.length).toBeGreaterThan(0);
          await addGrantCallback(tx);
          const after = await sql<
            Record<string, unknown>
          >`select * from identity.mcp_grant order by id`.execute(tx);
          expect(after.rows).toEqual(
            before.rows.map((row) => ({ ...row, redirect_uri: null })),
          );
          throw rollback;
        }),
      ).rejects.toBe(rollback);
    });

    it("rolls back failed OAuth writes, enforces expiry and refuses a destructive migration rollback", async () => {
      const repository = new McpAuthorizationRepository(
        createRlsDbProxy<McpAuthorizationTables>(),
      );
      const state = purposeClient(oauthContext()),
        record = oauthArtifact();
      await expect(
        withRequestContext(
          runtime.withPlugin(new CamelCasePlugin()),
          oauthContext(),
          async () => {
            await repository.save(record);
            throw new Error("OAuth rollback probe");
          },
        ),
      ).rejects.toThrow("OAuth rollback probe");
      expect(
        await state.mcpArtifacts.find.query({
          ...artifactKey(record),
          byUid: false,
        }),
      ).toBeNull();
      await state.mcpArtifacts.save.mutate(record);
      await sql`update identity.mcp_artifact set expires_at=clock_timestamp()-interval '1 second' where model=${record.model} and key=${record.key}`.execute(
        owner,
      );
      expect(
        await state.mcpArtifacts.find.query({
          ...artifactKey(record),
          byUid: false,
        }),
      ).toBeNull();
      expect(
        await state.mcpArtifacts.consume.mutate(artifactKey(record)),
      ).toEqual({ consumed: false });
      const before = (
        await sql`select * from finance.account order by id`.execute(owner)
      ).rows;
      const rollback = await new Migrator({
        db: owner,
        provider: migrationProvider(),
      }).migrateDown();
      expect(String(rollback.error)).toMatch(/explicit .*recovery plan/);
      expect(await migrate(owner, migrationProvider())).toEqual([]);
      expect(
        (await sql`select * from finance.account order by id`.execute(owner))
          .rows,
      ).toEqual(before);
    });

    it("isolates assistant storage in its own schema and forbids owner or retention reassignment", async () => {
      const first = purposeClient(ctx(a)).assistantConversations;
      const other = purposeClient(ctx(b)).assistantConversations;
      const chat = await first.create.mutate();
      try {
        expect(
          (await first.list.query()).some((row) => row.id === chat.id),
        ).toBe(true);
        expect(
          (await other.list.query()).some((row) => row.id === chat.id),
        ).toBe(false);
        await expect(other.get.query({ id: chat.id })).rejects.toMatchObject({
          data: { code: "NOT_FOUND" },
        });
        expect(await other.remove.mutate({ id: chat.id })).toEqual({
          removed: false,
        });
        expect(
          (await sql`select * from assistant.conversation`.execute(runtime))
            .rows,
        ).toEqual([]);
        const privileges = await sql<{
          usage: boolean;
          create: boolean;
        }>`select has_schema_privilege(current_user,'assistant','USAGE') as usage, has_schema_privilege(current_user,'assistant','CREATE') as create`.execute(
          runtime,
        );
        expect(privileges.rows[0]).toEqual({ usage: true, create: false });
        await sql`grant create on schema assistant to lazyfinance_test_runtime`.execute(
          owner,
        );
        try {
          await expect(assertRuntimeRole(runtime)).rejects.toThrow(/non-owner/);
        } finally {
          await sql`revoke create on schema assistant from lazyfinance_test_runtime`.execute(
            owner,
          );
        }
        for (const column of ["user_id", "id", "expires_at"]) {
          await expect(
            withRequestContext(runtime, ctx(a), (tx) =>
              sql`update assistant.conversation set ${sql.id(column)}=${column === "expires_at" ? new Date() : b} where id=${chat.id}`.execute(
                tx,
              ),
            ),
          ).rejects.toThrow(/permission denied/);
        }
        await expect(
          withRequestContext(runtime, ctx(a), (tx) =>
            sql`insert into assistant.conversation(user_id) values (${b})`.execute(
              tx,
            ),
          ),
        ).rejects.toThrow(/row-level security/);
      } finally {
        await first.remove.mutate({ id: chat.id });
      }
    });

    it("protects action approvals and immutable receipts with owner RLS and column grants independently of chat deletion", async () => {
      const userId = randomUUID();
      await sql`insert into identity."user"(id,email,name) values (${userId},${`${userId}@example.test`},'Action owner')`.execute(
        owner,
      );
      const client = purposeClient(ctx(userId));
      const chat = await client.assistantConversations.create.mutate();
      const lease = randomUUID(),
        turnId = randomUUID();
      const started = await client.assistantConversations.begin.mutate({
        conversationId: chat.id,
        requestId: turnId,
        text: "Prepara una etiqueta",
        lease,
      });
      const request = {
        kind: "create_tag" as const,
        tag: { name: `Approved ${userId}`, color: null },
      };
      await expect(
        client.financialActions.prepare.mutate({
          conversationId: chat.id,
          turnId,
          action: request,
          command: {
            kind: "create_tag",
            tag: { name: "Not the previewed selection", color: null },
          },
        }),
      ).rejects.toMatchObject({ data: { code: "BAD_REQUEST" } });
      const proposal = await client.financialActions.prepare.mutate({
        conversationId: chat.id,
        turnId,
        action: request,
        command: request,
      });
      await expect(
        client.financialActions.apply.mutate({
          id: proposal.id,
          version: 1,
          command: request,
        }),
      ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
      expect(await client.tags.list.query()).toEqual([]);
      await client.assistantConversations.finish.mutate({
        conversationId: chat.id,
        lease,
        turn: {
          ...started.turn,
          text: "Propuesta pendiente de aprobación",
          status: "complete",
          actions: [proposal],
        },
      });
      const applied = await client.financialActions.apply.mutate({
        id: proposal.id,
        version: 1,
        command: request,
      });
      expect(applied.status).toBe("applied");
      expect(
        await client.financialActions.apply.mutate({
          id: proposal.id,
          version: 1,
          command: request,
        }),
      ).toEqual(applied);
      await expect(
        purposeClient(ctx(b)).financialActions.get.query({ id: proposal.id }),
      ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
      await expect(
        purposeClient(oauthContext()).financialActions.get.query({
          id: proposal.id,
        }),
      ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
      await withRequestContext(runtime, ctx(b), async (tx) => {
        expect(
          (
            await sql`select * from assistant.action where id=${proposal.id}`.execute(
              tx,
            )
          ).rows,
        ).toEqual([]);
      });
      await expect(
        withRequestContext(runtime, ctx(userId), (tx) =>
          sql`update assistant.action set user_id=${b} where id=${proposal.id}`.execute(
            tx,
          ),
        ),
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        withRequestContext(runtime, ctx(userId), (tx) =>
          sql`update assistant.action set status='proposed' where id=${proposal.id}`.execute(
            tx,
          ),
        ),
      ).rejects.toMatchObject({ code: "23514" });
      await expect(
        withRequestContext(runtime, ctx(userId), (tx) =>
          sql`delete from assistant.action where id=${proposal.id}`.execute(tx),
        ),
      ).rejects.toMatchObject({ code: "42501" });
      await client.assistantConversations.remove.mutate({ id: chat.id });
      expect(
        await client.financialActions.get.query({ id: proposal.id }),
      ).toMatchObject({
        status: "applied",
        conversationId: null,
        results: applied.results,
      });
      expect(await client.tags.list.query()).toHaveLength(1);
    });

    it("claims assistant turns once, bounds concurrent conversations and rejects stale finishers", async () => {
      const client = purposeClient(ctx(a)).assistantConversations;
      const chat = await client.create.mutate();
      const second = await client.create.mutate();
      const input = {
        conversationId: chat.id,
        requestId: randomUUID(),
        text: "¿Qué saldos tengo?",
        lease: randomUUID(),
      };
      try {
        const results = await Promise.all([
          client.begin.mutate(input),
          client.begin.mutate(input),
        ]);
        expect(results.map((row) => row.acquired).sort()).toEqual([
          false,
          true,
        ]);
        const started = results.find((row) => row.acquired);
        if (!started) throw new Error("Missing acquired turn");
        await expect(
          client.begin.mutate({ ...input, text: "Otra pregunta" }),
        ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
        await expect(
          client.begin.mutate({
            ...input,
            conversationId: second.id,
            requestId: randomUUID(),
          }),
        ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
        const turn = {
          ...started.turn,
          text: "Respuesta guardada",
          status: "complete" as const,
        };
        expect(
          await client.finish.mutate({
            conversationId: chat.id,
            lease: randomUUID(),
            turn,
          }),
        ).toEqual({ saved: false });
        expect(
          await client.finish.mutate({
            conversationId: chat.id,
            lease: input.lease,
            turn,
          }),
        ).toEqual({ saved: true });
        expect(
          await client.finish.mutate({
            conversationId: chat.id,
            lease: input.lease,
            turn,
          }),
        ).toEqual({ saved: false });
        const replay = await client.begin.mutate(input);
        expect(replay.acquired).toBe(false);
        expect(replay.turn.text).toBe("Respuesta guardada");
        expect(replay.conversation.turnCount).toBe(1);
      } finally {
        await client.remove.mutate({ id: chat.id });
        await client.remove.mutate({ id: second.id });
      }
    });

    it("fills a delayed native question without approving its interrupted proposal or changing the next lease", async () => {
      const client = purposeClient(ctx(a));
      const chats = client.assistantConversations;
      const chat = await chats.create.mutate();
      const lease = randomUUID();
      try {
        const first = await chats.begin.mutate({
          conversationId: chat.id,
          requestId: randomUUID(),
          lease,
          text: "Consulta por voz",
        });
        const request = {
          kind: "create_tag" as const,
          tag: { name: `Voice ${randomUUID()}`, color: "#112233" },
        };
        const proposal = await client.financialActions.prepare.mutate({
          conversationId: chat.id,
          turnId: first.turn.id,
          action: request,
          command: request,
        });
        await chats.finish.mutate({
          conversationId: chat.id,
          lease,
          turn: {
            ...first.turn,
            status: "interrupted",
            actions: [proposal],
            voice: {
              question: "Audio interrumpido · transcripción no disponible",
              transcriptionPending: true,
            },
          },
        });
        const nextLease = randomUUID();
        const next = await chats.begin.mutate({
          conversationId: chat.id,
          requestId: randomUUID(),
          lease: nextLease,
          text: "La etiqueta debe ser roja",
        });
        const input = {
          conversationId: chat.id,
          turnId: first.turn.id,
          question: "Un presupuesto mensual de cien mil",
        };
        await expect(
          purposeClient(
            ctx(b),
          ).assistantConversations.recordVoiceQuestion.mutate(input),
        ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
        expect(await chats.recordVoiceQuestion.mutate(input)).toEqual({
          saved: true,
        });
        expect(await chats.recordVoiceQuestion.mutate(input)).toEqual({
          saved: true,
        });
        expect(
          await chats.recordVoiceQuestion.mutate({
            ...input,
            question: "Overwrite",
          }),
        ).toEqual({ saved: false });
        const saved = await chats.get.query({ id: chat.id });
        expect(saved.turns[0]).toMatchObject({
          status: "interrupted",
          actions: [{ id: proposal.id, status: "proposed" }],
          voice: { question: input.question },
        });
        expect(saved.turns[0].voice?.transcriptionPending).toBeUndefined();
        expect(saved.turns[1].status).toBe("pending");
        await expect(
          client.financialActions.apply.mutate({
            id: proposal.id,
            version: 1,
            command: request,
          }),
        ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
        expect(
          await chats.finish.mutate({
            conversationId: chat.id,
            lease: nextLease,
            turn: {
              ...next.turn,
              status: "complete",
              text: "¿Qué color prefieres?",
            },
          }),
        ).toEqual({ saved: true });
      } finally {
        await chats.remove.mutate({ id: chat.id });
      }
    });

    it("recovers expired assistant leases without replaying old turns or adopting late answers", async () => {
      const client = purposeClient(ctx(a)).assistantConversations;
      const chat = await client.create.mutate();
      const input = {
        conversationId: chat.id,
        requestId: randomUUID(),
        text: "Una pregunta",
        lease: randomUUID(),
      };
      try {
        const first = await client.begin.mutate(input);
        await sql`update assistant.conversation set lease_expires_at=clock_timestamp()-interval '1 second' where id=${chat.id}`.execute(
          owner,
        );
        expect((await client.get.query({ id: chat.id })).turns[0].status).toBe(
          "interrupted",
        );
        expect((await client.begin.mutate(input)).acquired).toBe(false);
        const next = await client.begin.mutate({
          ...input,
          requestId: randomUUID(),
          lease: randomUUID(),
        });
        expect(next.acquired).toBe(true);
        expect(next.conversation.turns.map((turn) => turn.status)).toEqual([
          "interrupted",
          "pending",
        ]);
        expect(
          await client.finish.mutate({
            conversationId: chat.id,
            lease: input.lease,
            turn: { ...first.turn, text: "Late", status: "complete" },
          }),
        ).toEqual({ saved: false });
      } finally {
        await client.remove.mutate({ id: chat.id });
      }
    });

    it("bounds assistant history and conversation creation atomically", async () => {
      const client = purposeClient(ctx(a)).assistantConversations;
      const outcomes = await Promise.allSettled(
        Array.from({ length: 12 }, () => client.create.mutate()),
      );
      const chats = outcomes.flatMap((outcome) =>
        outcome.status === "fulfilled" ? [outcome.value] : [],
      );
      try {
        expect(chats).toHaveLength(10);
        expect(
          outcomes.filter((outcome) => outcome.status === "rejected"),
        ).toHaveLength(2);
        const chat = chats[0];
        const turns = Array.from({ length: 24 }, () => ({
          id: randomUUID(),
          question: "Pregunta",
          text: "Respuesta",
          status: "complete",
          sources: [],
          actions: [],
          createdAt: new Date().toISOString(),
        }));
        await sql`update assistant.conversation set turns=${JSON.stringify(turns)}::jsonb where id=${chat.id}`.execute(
          owner,
        );
        await expect(
          client.begin.mutate({
            conversationId: chat.id,
            requestId: randomUUID(),
            text: "Más",
            lease: randomUUID(),
          }),
        ).rejects.toMatchObject({ data: { code: "TOO_MANY_REQUESTS" } });
        await sql`update assistant.conversation set created_at=clock_timestamp()-interval '2 days', expires_at=clock_timestamp()-interval '1 day' where id=${chat.id}`.execute(
          owner,
        );
        await expect(client.get.query({ id: chat.id })).rejects.toMatchObject({
          data: { code: "NOT_FOUND" },
        });
        chats.push(await client.create.mutate());
      } finally {
        await Promise.all(
          chats.map((chat) => client.remove.mutate({ id: chat.id })),
        );
      }
    });

    it("persists versioned account consent, serializes competing first writes and preserves unchanged timestamps", async () => {
      const userId = randomUUID();
      await sql`insert into identity."user"(id,email,name) values (${userId},${`${userId}@example.test`},'Consent owner')`.execute(
        owner,
      );
      const first = purposeClient(ctx(userId)).assistantConsent;
      const policyKey = "a".repeat(64);
      expect(await first.get.query()).toBeNull();
      expect(
        (
          await sql`select * from assistant.processing_consent where user_id=${userId}`.execute(
            owner,
          )
        ).rows,
      ).toEqual([]);
      const before = await sql<{
        now: Date;
      }>`select statement_timestamp() as now`.execute(owner);
      const raced = await Promise.allSettled([
        first.decide.mutate({
          policyKey,
          decision: "accepted",
          expectedRevision: 0,
        }),
        first.decide.mutate({
          policyKey,
          decision: "refused",
          expectedRevision: 0,
        }),
      ]);
      expect(
        raced.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      expect(
        raced.filter((result) => result.status === "rejected"),
      ).toHaveLength(1);
      const saved = await first.get.query();
      const after = await sql<{
        now: Date;
      }>`select statement_timestamp() as now`.execute(owner);
      expect(saved?.revision).toBe(1);
      if (!saved) throw new Error("Consent missing");
      expect(Date.parse(saved.decidedAt)).toBeGreaterThanOrEqual(
        before.rows[0].now.getTime(),
      );
      expect(Date.parse(saved.decidedAt)).toBeLessThanOrEqual(
        after.rows[0].now.getTime(),
      );
      expect(
        await purposeClient(ctx(userId)).assistantConsent.get.query(),
      ).toEqual(saved);
      expect(
        await first.decide.mutate({
          policyKey,
          decision: saved.decision,
          expectedRevision: 1,
        }),
      ).toEqual(saved);
      const refused = await first.decide.mutate({
        policyKey,
        decision: "refused",
        expectedRevision: 1,
      });
      const accepted = await first.decide.mutate({
        policyKey,
        decision: "accepted",
        expectedRevision: refused.revision,
      });
      expect(accepted.revision).toBe(refused.revision + 1);
      const withdrawn = await first.decide.mutate({
        policyKey,
        decision: "refused",
        expectedRevision: accepted.revision,
      });
      expect(withdrawn.revision).toBe(accepted.revision + 1);
      expect(withdrawn.decidedAt).toEqual(expect.any(String));
      await expect(
        first.decide.mutate({
          policyKey: "b".repeat(64),
          decision: "accepted",
          expectedRevision: 0,
        }),
      ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
      const newPolicy = await first.decide.mutate({
        policyKey: "b".repeat(64),
        decision: "accepted",
        expectedRevision: withdrawn.revision,
      });
      expect(newPolicy.revision).toBe(withdrawn.revision + 1);
      expect(
        await purposeClient(ctx(b)).assistantConsent.get.query(),
      ).toBeNull();
      const raw = createTRPCUntypedClient({
        links: [
          httpLink({
            url: `${url}/trpc`,
            headers: async () => ({
              authorization: `Bearer ${await sign(ctx(userId))}`,
            }),
          }),
        ],
      });
      await expect(
        raw.mutation("assistantConsent.decide", {
          policyKey,
          decision: "accepted",
          expectedRevision: newPolicy.revision,
          userId: b,
        }),
      ).rejects.toMatchObject({ data: { code: "BAD_REQUEST" } });
      await expect(
        raw.query("assistantConsent.get", { userId: b }),
      ).rejects.toMatchObject({ data: { code: "BAD_REQUEST" } });
    });

    it("forces consent owner RLS and grants no deletion or owner reassignment", async () => {
      const policyKey = "c".repeat(64);
      await sql`insert into assistant.processing_consent(user_id,policy_key,decision,revision) values (${a},${policyKey},'accepted',1),(${b},${policyKey},'refused',1)`.execute(
        owner,
      );
      await withRequestContext(runtime, ctx(a), async (tx) => {
        const rows = await sql<{
          user_id: string;
        }>`select user_id from assistant.processing_consent`.execute(tx);
        expect(rows.rows.map((row) => row.user_id)).toEqual([a]);
        expect(
          (
            await sql`update assistant.processing_consent set decision='accepted' where user_id=${b} returning user_id`.execute(
              tx,
            )
          ).rows,
        ).toEqual([]);
      });
      expect(
        (await sql`select * from assistant.processing_consent`.execute(runtime))
          .rows,
      ).toEqual([]);
      for (const identity of [
        oauthContext(),
        {
          kind: "identity-bootstrap" as const,
          identity: {
            provider: "mock" as const,
            issuer: "https://identity.example.test",
            providerSubject: "test",
            verifiedEmail: null,
            displayName: null,
          },
          requestId: randomUUID(),
        },
      ]) {
        await withRequestContext(runtime, identity, async (tx) => {
          expect(
            (await sql`select * from assistant.processing_consent`.execute(tx))
              .rows,
          ).toEqual([]);
        });
      }
      await expect(
        withRequestContext(runtime, ctx(a), (tx) =>
          sql`insert into assistant.processing_consent(user_id,policy_key,decision,revision) values (${b},${policyKey},'accepted',1)`.execute(
            tx,
          ),
        ),
      ).rejects.toThrow(/row-level security/);
      for (const operation of [
        (tx: QueryExecutorProvider) =>
          sql`delete from assistant.processing_consent where user_id=${a}`.execute(
            tx,
          ),
        (tx: QueryExecutorProvider) =>
          sql`update assistant.processing_consent set user_id=${b} where user_id=${a}`.execute(
            tx,
          ),
      ])
        await expect(
          withRequestContext(runtime, ctx(a), operation),
        ).rejects.toThrow(/permission denied/);
      const flags = await sql<{
        relrowsecurity: boolean;
        relforcerowsecurity: boolean;
      }>`select relrowsecurity,relforcerowsecurity from pg_class where oid='assistant.processing_consent'::regclass`.execute(
        owner,
      );
      expect(flags.rows).toEqual([
        { relrowsecurity: true, relforcerowsecurity: true },
      ]);
    });

    it("persists account onboarding, keeps completion terminal and preserves its first timestamp across races", async () => {
      const client = (userId: string) =>
        createTRPCClient<PersistenceRouter>({
          links: [
            httpLink({
              url: `${url}/trpc`,
              headers: async () => ({
                authorization: `Bearer ${await sign(ctx(userId))}`,
              }),
            }),
          ],
        });
      const first = client(a),
        other = client(b);
      expect(await first.onboarding.state.query()).toEqual({
        status: "active",
        completedAt: null,
      });
      expect(await other.onboarding.state.query()).toEqual({
        status: "active",
        completedAt: null,
      });
      expect(
        await first.onboarding.finish.mutate({ status: "skipped" }),
      ).toEqual({ status: "skipped", completedAt: null });
      expect(await other.onboarding.state.query()).toEqual({
        status: "active",
        completedAt: null,
      });
      await Promise.all([
        first.onboarding.finish.mutate({ status: "completed" }),
        first.onboarding.finish.mutate({ status: "skipped" }),
      ]);
      const completed = await first.onboarding.state.query();
      expect(completed.status).toBe("completed");
      expect(completed.completedAt).toEqual(expect.any(String));
      for (const status of ["skipped", "completed"] as const)
        expect(await client(a).onboarding.finish.mutate({ status })).toEqual(
          completed,
        );
      expect(await client(a).onboarding.state.query()).toEqual(completed);

      // Concurrent first writes also converge on completion, not a stale skip.
      await Promise.all([
        other.onboarding.finish.mutate({ status: "completed" }),
        other.onboarding.finish.mutate({ status: "skipped" }),
      ]);
      expect((await other.onboarding.state.query()).status).toBe("completed");
    });

    it("isolates onboarding records with RLS and forbids deleting or reassigning completion records", async () => {
      await sql`insert into identity.onboarding(user_id,status,completed_at)
        values (${a},'completed',clock_timestamp()),(${b},'completed',clock_timestamp())
        on conflict (user_id) do nothing`.execute(owner);
      await withRequestContext(runtime, ctx(a), async (tx) => {
        const { rows } = await sql<{
          user_id: string;
        }>`select user_id from identity.onboarding`.execute(tx);
        expect(rows.map((row) => row.user_id)).toEqual([a]);
        const changed =
          await sql`update identity.onboarding set status='skipped',completed_at=null where user_id=${b} returning user_id`.execute(
            tx,
          );
        expect(changed.rows).toEqual([]);
      });
      expect(
        (await sql`select * from identity.onboarding`.execute(runtime)).rows,
      ).toEqual([]);
      await expect(
        withRequestContext(runtime, ctx(a), (tx) =>
          sql`insert into identity.onboarding(user_id,status) values (${b},'skipped')`.execute(
            tx,
          ),
        ),
      ).rejects.toThrow(/row-level security/);
      for (const operation of [
        (tx: QueryExecutorProvider) =>
          sql`delete from identity.onboarding where user_id=${a}`.execute(tx),
        (tx: QueryExecutorProvider) =>
          sql`update identity.onboarding set user_id=${b} where user_id=${a}`.execute(
            tx,
          ),
      ])
        await expect(
          withRequestContext(runtime, ctx(a), operation),
        ).rejects.toThrow(/permission denied/);
      await expect(
        withRequestContext(runtime, ctx(a), (tx) =>
          sql`update identity.onboarding set status='completed',completed_at=null where user_id=${a}`.execute(
            tx,
          ),
        ),
      ).rejects.toThrow(/check constraint/);
      await expect(
        withRequestContext(runtime, ctx(a), (tx) =>
          sql`update identity.onboarding set status='active',completed_at=null where user_id=${a}`.execute(
            tx,
          ),
        ),
      ).rejects.toThrow(/check constraint/);
    });

    it("isolates Link Intents and enforces both related owners even without repository validation", async () => {
      const intentA = randomUUID(),
        intentB = randomUUID();
      await sql`insert into finance.provider_link_intent
        (id,user_id,provider_intent_id,mode,holder_type,connection_id,expected_version) values
        (${intentA},${a},${`li_${intentA}`},'test','individual',${connectionA},0),
        (${intentB},${b},${`li_${intentB}`},'test','individual',${connectionB},0)`.execute(
        owner,
      );

      await withRequestContext(runtime, ctx(a), async (db) => {
        const { rows } = await sql<{
          id: string;
        }>`select id from finance.provider_link_intent`.execute(db);
        expect(rows.map(({ id }) => id)).toEqual([intentA]);
        expect(
          (
            await sql`update finance.provider_link_intent set state='failed' where id=${intentB} returning id`.execute(
              db,
            )
          ).rows,
        ).toEqual([]);
      });
      expect(
        (await sql`select * from finance.provider_link_intent`.execute(runtime))
          .rows,
      ).toEqual([]);

      for (const work of [
        (db: QueryExecutorProvider) =>
          sql`insert into finance.provider_link_intent
          (id,user_id,provider_intent_id,mode,holder_type) values
          (${randomUUID()},${b},${`li_${randomUUID()}`},'test','individual')`.execute(
            db,
          ),
        (db: QueryExecutorProvider) =>
          sql`insert into finance.provider_link_intent
          (id,user_id,provider_intent_id,mode,holder_type,connection_id,expected_version) values
          (${randomUUID()},${a},${`li_${randomUUID()}`},'test','individual',${connectionB},0)`.execute(
            db,
          ),
        (db: QueryExecutorProvider) =>
          sql`insert into finance.provider_link_intent
          (id,user_id,provider_intent_id,mode,holder_type,state,completed_connection_id) values
          (${randomUUID()},${a},${`li_${randomUUID()}`},'test','individual','completed',${connectionB})`.execute(
            db,
          ),
        (db: QueryExecutorProvider) =>
          sql`update finance.provider_link_intent set connection_id=${connectionB} where id=${intentA}`.execute(
            db,
          ),
        (db: QueryExecutorProvider) =>
          sql`update finance.provider_link_intent set state='completed',completed_connection_id=${connectionB} where id=${intentA}`.execute(
            db,
          ),
        (db: QueryExecutorProvider) =>
          sql`update finance.provider_link_intent set user_id=${b} where id=${intentA}`.execute(
            db,
          ),
      ])
        await expect(withRequestContext(runtime, ctx(a), work)).rejects.toThrow(
          /row-level security/,
        );

      await expect(
        withRequestContext(runtime, ctx(a), (db) =>
          sql`delete from finance.provider_link_intent where id=${intentA}`.execute(
            db,
          ),
        ),
      ).rejects.toThrow(/permission denied/);
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

    it("protects parent, decision and provider tables without user WHERE predicates", async () => {
      const tables = [
        "provider_connection",
        "account",
        "tag",
        "tag_rule",
        "transaction",
        "tag_decision_event",
        "objective",
        "objective_tag",
        "budget_revision",
        "budget_revision_tag",
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
        (db: QueryExecutorProvider) =>
          sql`select * from identity.external_identity`.execute(db),
        (db: QueryExecutorProvider) =>
          sql`insert into finance.provider(identifier) values (${randomUUID()})`.execute(
            db,
          ),
        (db: QueryExecutorProvider) =>
          sql`update finance.tag_decision_event set kind='reset' where user_id=${a}`.execute(
            db,
          ),
        (db: QueryExecutorProvider) =>
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

    it("protects budget revision ownership and prevents rewriting configuration payloads", async () => {
      await withRequestContext(runtime, ctx(a), async (tx) => {
        const revisions = await sql<{
          id: string;
        }>`select id from finance.budget_revision`.execute(tx);
        const links = await sql<{
          revision_id: string;
        }>`select revision_id from finance.budget_revision_tag`.execute(tx);
        expect(revisions.rows.map((row) => row.id)).toEqual([objectiveA]);
        expect(links.rows.map((row) => row.revision_id)).toEqual([objectiveA]);
      });
      for (const work of [
        (db: QueryExecutorProvider) =>
          sql`insert into finance.budget_revision(objective_id,version,name,amount,kind,effective_from)
          values (${objectiveB},2,'Foreign',1,'amount_based',now())`.execute(
            db,
          ),
        (db: QueryExecutorProvider) =>
          sql`insert into finance.budget_revision_tag(revision_id,tag_id)
          values (${objectiveA},${tagB})`.execute(db),
        (db: QueryExecutorProvider) =>
          sql`insert into finance.budget_revision_tag(revision_id,tag_id)
          values (${objectiveB},${tagA})`.execute(db),
      ])
        await expect(withRequestContext(runtime, ctx(a), work)).rejects.toThrow(
          /row-level security/,
        );

      for (const work of [
        (db: QueryExecutorProvider) =>
          sql`update finance.budget_revision set amount=2 where id=${objectiveA}`.execute(
            db,
          ),
        (db: QueryExecutorProvider) =>
          sql`delete from finance.budget_revision where id=${objectiveA}`.execute(
            db,
          ),
        (db: QueryExecutorProvider) =>
          sql`delete from finance.budget_revision_tag where revision_id=${objectiveA}`.execute(
            db,
          ),
      ])
        await expect(withRequestContext(runtime, ctx(a), work)).rejects.toThrow(
          /permission denied/,
        );
    });

    it("denies cross-user foreign references and owner reassignment", async () => {
      for (const work of [
        (db: QueryExecutorProvider) =>
          sql`insert into finance.account(user_id,provider_connection_id,type) values (${a},${connectionB},'checking')`.execute(
            db,
          ),
        (db: QueryExecutorProvider) =>
          sql`update finance.account set user_id=${b} where id=${accountA}`.execute(
            db,
          ),
        (db: QueryExecutorProvider) =>
          sql`update finance."transaction" set tag_id=${tagB},tag_decision_origin='manual' where id=${movementA}`.execute(
            db,
          ),
        (db: QueryExecutorProvider) =>
          sql`update finance.tag_rule set account_id=${accountB} where id=${ruleA}`.execute(
            db,
          ),
        (db: QueryExecutorProvider) =>
          sql`update finance.income_receipt set source_id=${sourceB} where transaction_id=${movementA}`.execute(
            db,
          ),
        (db: QueryExecutorProvider) =>
          sql`insert into finance.objective_tag(objective_id,tag_id) values (${objectiveA},${tagB})`.execute(
            db,
          ),
        (db: QueryExecutorProvider) =>
          sql`insert into finance.tag_decision_event(user_id,transaction_id,kind) values (${a},${movementB},'reset')`.execute(
            db,
          ),
      ])
        await expect(
          withRequestContext(runtime, ctx(a), work),
        ).rejects.toThrow();
    });

    it("protects both expense-adjustment owners on reads, writes, reassignment and upserts", async () => {
      const users = [randomUUID(), randomUUID()];
      const connections = [randomUUID(), randomUUID()];
      const accounts = [randomUUID(), randomUUID()];
      const credits = [randomUUID(), randomUUID()];
      const purchases = [randomUUID(), randomUUID()];
      const adjustments = [randomUUID(), randomUUID()];

      for (const i of [0, 1]) {
        await sql`insert into identity."user"(id,email,name) values (${users[i]},${users[i] + "@example.test"},'Adjustment owner')`.execute(
          owner,
        );
        await sql`insert into finance.provider_connection(id,user_id,provider_id)
          select ${connections[i]},${users[i]},provider_id from finance.provider_connection where id=${connectionA}`.execute(
          owner,
        );
        await sql`insert into finance.account(id,user_id,provider_connection_id,type)
          values (${accounts[i]},${users[i]},${connections[i]},'checking')`.execute(
          owner,
        );
        await sql`insert into finance."transaction"(id,account_id,booked_at,amount,type,is_internal_movement) values
          (${purchases[i]},${accounts[i]},'2026-10-01T15:00:00Z',-10,'debit',false),
          (${credits[i]},${accounts[i]},'2026-11-01T15:00:00Z',10,'credit',false)`.execute(
          owner,
        );
        await withRequestContext(runtime, ctx(users[i]), (db) =>
          sql`insert into finance.expense_adjustment(id,credit_transaction_id,purchase_transaction_id,kind,amount,
            credit_amount,purchase_amount,credit_booked_at,purchase_booked_at)
          values (${adjustments[i]},${credits[i]},${purchases[i]},'refund',1,10,-10,'2026-11-01T15:00:00Z','2026-10-01T15:00:00Z')`.execute(
            db,
          ),
        );
        await withRequestContext(runtime, ctx(users[i]), async (db) => {
          const { rows } = await sql<{
            id: string;
          }>`select id from finance.expense_adjustment`.execute(db);
          expect(rows.map(({ id }) => id)).toEqual([adjustments[i]]);
        });
      }

      expect(
        (await sql`select * from finance.expense_adjustment`.execute(runtime))
          .rows,
      ).toEqual([]);
      for (const work of [
        (db: QueryExecutorProvider) =>
          sql`insert into finance.expense_adjustment(credit_transaction_id,purchase_transaction_id,kind,amount,
          credit_amount,purchase_amount,credit_booked_at,purchase_booked_at)
          values (${credits[0]},${purchases[1]},'refund',1,10,-10,'2026-11-01T15:00:00Z','2026-10-01T15:00:00Z')`.execute(
            db,
          ),
        (db: QueryExecutorProvider) =>
          sql`insert into finance.expense_adjustment(credit_transaction_id,purchase_transaction_id,kind,amount,
          credit_amount,purchase_amount,credit_booked_at,purchase_booked_at)
          values (${credits[1]},${purchases[0]},'refund',1,10,-10,'2026-11-01T15:00:00Z','2026-10-01T15:00:00Z')`.execute(
            db,
          ),
        (db: QueryExecutorProvider) =>
          sql`update finance.expense_adjustment set credit_transaction_id=${credits[1]} where id=${adjustments[0]}`.execute(
            db,
          ),
        (db: QueryExecutorProvider) =>
          sql`update finance.expense_adjustment set purchase_transaction_id=${purchases[1]} where id=${adjustments[0]}`.execute(
            db,
          ),
        (db: QueryExecutorProvider) =>
          sql`insert into finance.expense_adjustment(credit_transaction_id,purchase_transaction_id,kind,amount,
          credit_amount,purchase_amount,credit_booked_at,purchase_booked_at)
          values (${credits[1]},${purchases[1]},'refund',2,10,-10,'2026-11-01T15:00:00Z','2026-10-01T15:00:00Z')
          on conflict(credit_transaction_id,purchase_transaction_id) do update set amount=excluded.amount`.execute(
            db,
          ),
      ])
        await expect(
          withRequestContext(runtime, ctx(users[0]), work),
        ).rejects.toThrow(/row-level security/);

      await withRequestContext(runtime, ctx(users[0]), async (db) => {
        expect(
          (
            await sql`update finance.expense_adjustment set amount=2 where id=${adjustments[1]} returning id`.execute(
              db,
            )
          ).rows,
        ).toEqual([]);
        expect(
          (
            await sql`delete from finance.expense_adjustment where id=${adjustments[1]} returning id`.execute(
              db,
            )
          ).rows,
        ).toEqual([]);
        expect(
          (
            await sql`update finance.expense_adjustment set amount=2 where id=${adjustments[0]} returning id`.execute(
              db,
            )
          ).rows,
        ).toHaveLength(1);
        expect(
          (
            await sql`delete from finance.expense_adjustment where id=${adjustments[0]} returning id`.execute(
              db,
            )
          ).rows,
        ).toHaveLength(1);
      });
      const retained = await sql<{
        amount: string;
      }>`select amount from finance.expense_adjustment where id=${adjustments[1]}`.execute(
        owner,
      );
      expect(retained.rows).toEqual([{ amount: "1.00" }]);
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
        expect.objectContaining({
          id: objectiveA,
          tags: [{ id: tagA, name: "A", color: null }],
        }),
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
      expect(await client.income.expectedFacts.query(period)).toEqual({
        sources: facts.sources,
        expectations: facts.expectations,
      });
      expect(await client.income.receipts.query(period)).toEqual(
        facts.receipts,
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
      const nextRun = await client.providerSync.begin.mutate({
        connectionId: connection,
        provider: provider.identifier,
      });
      const nextScope = { ...scope, revision: nextRun.revision };
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
      const finalRun = await client.providerSync.begin.mutate({
        connectionId: connection,
        provider: provider.identifier,
      });
      const finalScope = { ...scope, revision: finalRun.revision };
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
      const afterReplay = await client.providerSync.status.query({
        id: connection,
      });
      if (!afterReplay.state) throw new Error("Missing committed sync state");
      expect(
        (
          await client.providerSync.facts.query({
            ...scope,
            revision: afterReplay.state.revision,
          })
        ).movements[0].removedAt,
      ).not.toBeNull();
      const failureRun = await client.providerSync.begin.mutate({
        connectionId: connection,
        provider: provider.identifier,
      });
      await client.providerSync.failure.mutate({
        connectionId: connection,
        revision: failureRun.revision,
        reason: "retryable",
        observedAt: "2026-10-18T18:00:00.000Z",
        retryAfter: null,
      });
      expect(
        (await client.providerSync.status.query({ id: connection })).state,
      ).toMatchObject({
        checkpoint: "replayed",
        revision: failureRun.revision + 1,
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

    it("aggregates owned budget windows without fan-out and preserves empty objectives and archived tag facts", async () => {
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
      const budgetClient = createTRPCClient<PersistenceRouter>({
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
      const archived = randomUUID(),
        other = randomUUID();
      const monthly = randomUUID(),
        shorter = randomUUID(),
        empty = randomUUID();
      await sql`insert into finance.tag(id,user_id,name,is_archived) values
        (${archived},${a},'Historical budget tag',true), (${other},${a},'Other budget tag',false)`.execute(
        owner,
      );
      for (const id of [monthly, shorter, empty])
        await sql`insert into finance.objective(id,user_id,name,amount,kind,intent,is_recurring,period,start_date)
          values (${id},${a},${id},100,'time_based','spending',true,'monthly','2026-01-01T15:00:00Z')`.execute(
          owner,
        );
      for (const id of [monthly, shorter])
        await sql`insert into finance.objective_tag(objective_id,tag_id)
          values (${id},${archived}), (${id},${other})`.execute(owner);

      for (const [tag, amount, booked, internal, review, removed] of [
        [archived, -10, "2026-09-14T15:00:00Z", false, "clear", false],
        [other, -10, "2026-09-15T15:00:00Z", false, "clear", false],
        [archived, -1, "2026-09-01T04:00:00Z", false, "clear", false],
        [archived, -2, "2026-09-01T03:59:59.999Z", false, "clear", false],
        [archived, -3, "2026-10-01T03:00:00Z", false, "clear", false],
        [archived, -4, "2026-09-16T15:00:00Z", false, "clear", false],
        [null, -5, "2026-09-14T15:00:00Z", false, "clear", false],
        [archived, -50, "2026-09-14T15:00:00Z", true, "clear", false],
        [archived, -60, "2026-09-14T15:00:00Z", null, "clear", false],
        [archived, -70, "2026-09-14T15:00:00Z", false, "needs_review", false],
        [archived, -80, "2026-09-14T15:00:00Z", false, "clear", true],
      ] as const)
        await sql`insert into finance."transaction"(account_id,amount,type,booked_at,tag_id,tag_decision_origin,is_internal_movement,review_status,removed_at,removal_reason)
          values (${accountA},${amount},'debit',${new Date(booked)},${tag},${tag ? "manual" : "unreviewed"},${internal},${review},${removed ? new Date(booked) : null},${removed ? "removed" : null})`.execute(
          owner,
        );

      const period = {
        start: "2026-09-01 00:00:00",
        end: "2026-10-01 00:00:00",
        asOf: "2026-09-15T15:00:00.000Z",
      };
      const windows = [monthly, shorter, empty, objectiveB].map((id) => ({
        id,
        revisionId: id,
        start: id === shorter ? "2026-09-10 00:00:00" : period.start,
        end: period.end,
      }));
      const totals = await budgetClient.objectives.spending.query({
        windows,
        asOf: period.asOf,
      });
      expect(totals).toHaveLength(3);
      expect(totals).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: monthly,
            revisionId: monthly,
            amount: "-21.00",
            count: 3,
          }),
          expect.objectContaining({
            id: shorter,
            revisionId: shorter,
            amount: "-20.00",
            count: 2,
          }),
          expect.objectContaining({
            id: empty,
            revisionId: empty,
            amount: "0",
            count: 0,
          }),
        ]),
      );
      await expect(
        budgetClient.objectives.spending.query({
          windows: [windows[0], windows[0]],
        }),
      ).rejects.toMatchObject({ data: { code: "BAD_REQUEST" } });
      expect(
        (await client.objectives.list.query()).find(({ id }) => id === empty)
          ?.tags,
      ).toEqual([]);
      expect(
        (await client.objectives.list.query()).find(({ id }) => id === monthly)
          ?.tags,
      ).toEqual(
        expect.arrayContaining([
          { id: archived, name: "Historical budget tag", color: null },
        ]),
      );
      const tagged = await client.transactions.taggedAggregates.query(period);
      expect(tagged).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            tag: { id: archived, name: "Historical budget tag", color: null },
            type: "debit",
            isInternalMovement: false,
            reviewStatus: "clear",
            amount: "-11.00",
            count: 2,
          }),
          expect.objectContaining({ tag: null, amount: "-5.00", count: 1 }),
        ]),
      );
      expect(await client.transactions.aggregates.query(period)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "debit",
            isInternalMovement: false,
            reviewStatus: "clear",
            amount: "-26.00",
            count: 4,
          }),
        ]),
      );
    });

    it("joins provider movement keys and receipt existence into fingerprinted facts", async () => {
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
      const account = randomUUID(),
        movement = randomUUID();
      await sql`insert into finance.account(id,user_id,provider_connection_id,type,external_id)
        values (${account},${a},${connectionA},'checking','joined-facts-account')`.execute(
        owner,
      );
      await sql`insert into finance."transaction"(id,account_id,amount,type,booked_at,external_id,is_internal_movement,source)
        values (${movement},${account},40,'credit','2026-09-14T15:00:00Z','joined-facts-credit',false,'provider')`.execute(
        owner,
      );
      const state = await client.providerSync.begin.mutate({
        connectionId: connectionA,
        provider: (
          await sql<{ identifier: string }>`
        select p.identifier from finance.provider p join finance.provider_connection c on c.provider_id=p.id where c.id=${connectionA}
      `.execute(owner)
        ).rows[0].identifier,
      });
      const scope = {
        connectionId: connectionA,
        revision: state.revision,
        keys: [
          {
            accountExternalId: "joined-facts-account",
            externalId: "joined-facts-credit",
          },
        ],
      };
      const before = await client.providerSync.facts.query(scope);
      expect(before.movements).toEqual([
        expect.objectContaining({
          id: movement,
          accountExternalId: "joined-facts-account",
          hasReceipt: false,
        }),
      ]);
      await client.incomeReceipts.confirm.mutate({
        transactionId: movement,
        sourceId: sourceA,
        at: "2026-09-15T15:00:00.000Z",
      });
      const after = await client.providerSync.facts.query(scope);
      expect(after.movements).toEqual([
        expect.objectContaining({
          id: movement,
          accountExternalId: "joined-facts-account",
          hasReceipt: true,
        }),
      ]);
      expect(after.fingerprint).not.toBe(before.fingerprint);
      await expect(
        client.providerSync.commit.mutate({
          scope,
          expectedFingerprint: before.fingerprint,
          observedAt: "2026-09-15T15:00:00.000Z",
          checkpoint: "stale",
          accounts: [],
          movements: [],
          removals: [],
        }),
      ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
    });
    it("isolates immutable savings revisions and both ends of their tag links", async () => {
      const goals = [randomUUID(), randomUUID()];
      for (const [id, user, tag] of [
        [goals[0], a, tagA],
        [goals[1], b, tagB],
      ]) {
        await sql`insert into finance.objective(id,user_id,name,amount,kind,intent) values (${id},${user},'Savings',100,'amount_based','saving')`.execute(
          owner,
        );
        await withRequestContext(runtime, ctx(user), async (db) => {
          await sql`insert into finance.savings_revision(id,objective_id,version,name,amount,kind) values (${id},${id},1,'Savings',100,'amount_based')`.execute(
            db,
          );
          await sql`insert into finance.savings_revision_tag(revision_id,tag_id) values (${id},${tag})`.execute(
            db,
          );
        });
      }
      await withRequestContext(runtime, ctx(a), async (db) => {
        expect(
          (
            await sql<{
              id: string;
            }>`select id from finance.savings_revision`.execute(db)
          ).rows.map((row) => row.id),
        ).toEqual([goals[0]]);
        expect(
          (
            await sql<{
              revision_id: string;
            }>`select revision_id from finance.savings_revision_tag`.execute(db)
          ).rows.map((row) => row.revision_id),
        ).toEqual([goals[0]]);
      });
      for (const work of [
        (db: QueryExecutorProvider) =>
          sql`insert into finance.savings_revision(objective_id,version,name,amount,kind) values (${goals[1]},2,'Foreign',1,'amount_based')`.execute(
            db,
          ),
        (db: QueryExecutorProvider) =>
          sql`insert into finance.savings_revision_tag(revision_id,tag_id) values (${goals[0]},${tagB})`.execute(
            db,
          ),
        (db: QueryExecutorProvider) =>
          sql`insert into finance.savings_revision_tag(revision_id,tag_id) values (${goals[1]},${tagA})`.execute(
            db,
          ),
      ])
        await expect(withRequestContext(runtime, ctx(a), work)).rejects.toThrow(
          /row-level security/,
        );
      for (const work of [
        (db: QueryExecutorProvider) =>
          sql`update finance.savings_revision set amount=1 where id=${goals[0]}`.execute(
            db,
          ),
        (db: QueryExecutorProvider) =>
          sql`delete from finance.savings_revision_tag where revision_id=${goals[0]}`.execute(
            db,
          ),
      ])
        await expect(withRequestContext(runtime, ctx(a), work)).rejects.toThrow(
          /permission denied/,
        );
    });
  },
);
