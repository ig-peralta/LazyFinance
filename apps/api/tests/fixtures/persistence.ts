import "reflect-metadata";
import { randomUUID } from "node:crypto";
import type { ApiRouter } from "@lazyfinance/rpc-api";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { MCP_STRATEGY, type McpStrategy } from "@rekog/mcp-nest";
import { createTRPCClient, httpLink } from "@trpc/client";
import { AppModule } from "../../src/app.module";
import { MockAuthService } from "../../src/auth/mock/mock-auth.service";
import { FINTOC_FETCH } from "../../src/banking/fintoc/client/fintoc-client";
import { EnvironmentService } from "../../src/environment/environment.service";
import { PersistenceClient } from "../../src/persistence/persistence.client";
import { testMockAuth } from "./auth/mock-auth";
import { FixtureDatabase } from "./database";
import { testEnvironment } from "./environment";

export const integration = Boolean(
  process.env.TEST_POSTGRES_OWNER_URL && process.env.TEST_PERSISTENCE_RPC_URL,
);

export async function fixture(withAccounts = false) {
  const db = new FixtureDatabase();
  const userId = randomUUID(),
    otherUserId = randomUUID(),
    token = randomUUID(),
    otherToken = randomUUID();
  const connectionId = randomUUID(),
    otherConnectionId = randomUUID(),
    accountId = randomUUID(),
    otherAccountId = randomUUID();

  for (const [id, subject] of [
    [userId, token],
    [otherUserId, otherToken],
  ]) {
    await db.insert("user", {
      id,
      email: `${id}@example.test`,
      name: "Test owner",
    });
    await db.insert("external_identity", {
      provider: "mock",
      issuer: "https://mock.lazyfinance.cl",
      providerSubject: subject,
      userId: id,
    });
  }

  const provider = await db.pool.query<{ id: string }>(
    `INSERT INTO finance.provider(identifier) VALUES ('fixture-bank') ON CONFLICT(identifier) DO UPDATE SET identifier=excluded.identifier RETURNING id`,
  );

  for (const [id, user] of [
    [connectionId, userId],
    [otherConnectionId, otherUserId],
  ])
    await db.insert("provider_connection", {
      id,
      userId: user,
      providerId: provider.rows[0].id,
      mode: "test",
    });

  if (withAccounts)
    for (const [id, user, connection] of [
      [accountId, userId, connectionId],
      [otherAccountId, otherUserId, otherConnectionId],
    ]) {
      await db.insert("account", {
        id,
        userId: user,
        providerConnectionId: connection,
        type: "checking",
        balance: "500000.00",
      });
    }

  const environment = testEnvironment();
  const persistence = new PersistenceClient(environment);

  return {
    db,
    userId,
    otherUserId,
    token,
    otherToken,
    connectionId,
    otherConnectionId,
    accountId,
    otherAccountId,
    persistence,
    environment,
  };
}

export type Fixture = Awaited<ReturnType<typeof fixture>>;

export async function startApi(
  f: Fixture,
  mcp = false,
  fintocFetch?: typeof fetch,
) {
  const { verifier } = testMockAuth({
    [f.token]: {
      userId: f.userId,
      email: `${f.userId}@example.test`,
      name: "Owner",
    },
    [f.otherToken]: {
      userId: f.otherUserId,
      email: `${f.otherUserId}@example.test`,
      name: "Other",
    },
  });
  const builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(EnvironmentService)
    .useValue(f.environment)
    .overrideProvider(MockAuthService)
    .useValue(verifier);
  if (fintocFetch) builder.overrideProvider(FINTOC_FETCH).useValue(fintocFetch);
  const module = await builder.compile();
  const app: INestApplication = module.createNestApplication({ logger: false });

  if (mcp) {
    const strategy = app.get<McpStrategy>(MCP_STRATEGY);
    strategy.setHttpAdapter(app.getHttpAdapter());
    app.connectMicroservice({ strategy });
    await app.startAllMicroservices();
  }

  await app.listen(0, "127.0.0.1");
  const url = await app.getUrl();
  const client = (token: string = f.token) =>
    createTRPCClient<ApiRouter>({
      links: [
        httpLink({
          url: `${url}/trpc`,
          headers: () => ({ authorization: `Bearer ${token}` }),
        }),
      ],
    });

  return { app, url, client };
}
