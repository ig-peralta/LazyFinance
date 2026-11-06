import "reflect-metadata";
import { randomUUID } from "node:crypto";
import type { ApiRouter } from "@lazyfinance/rpc-api";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { MCP_STRATEGY, type McpStrategy } from "@rekog/mcp-nest";
import { createTRPCClient, httpLink } from "@trpc/client";
import { Pool, types } from "pg";
import { AppModule } from "../src/app.module";
import { MockAuthService } from "../src/auth/mock/mock-auth.service";
import { testMockAuth } from "../src/auth/testing/mock-auth-fixtures";
import { ENV_SCHEMA } from "../src/environment/environment.schema";
import { EnvironmentService } from "../src/environment/environment.service";
import { PersistenceClient } from "../src/persistence/persistence.client";

export const integration = Boolean(
  process.env.TEST_POSTGRES_OWNER_URL && process.env.TEST_PERSISTENCE_RPC_URL,
);

types.setTypeParser(1082, (value) => value);

const schemas = {
  user: "identity",
  external_identity: "identity",
  provider: "finance",
  provider_connection: "finance",
  account: "finance",
  transaction: "finance",
  tag: "finance",
  tag_rule: "finance",
  tag_decision_event: "finance",
  income_source: "finance",
  income_expectation: "finance",
  income_receipt: "finance",
  objective: "finance",
  objective_tag: "finance",
  provider_sync_state: "finance",
  provider_movement_removal: "finance",
  provider_movement_conflict: "finance",
} as const;

type Table = keyof typeof schemas;

const column = (name: string) => {
  if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(name))
    throw new Error("Invalid fixture field");

  return `"${name.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)}"`;
};

/** Owner SQL is restricted to disposable test fixtures, never injectable into the API. */
export class FixtureDatabase {
  readonly pool: Pool;

  constructor() {
    const url = process.env.TEST_POSTGRES_OWNER_URL!;
    if (!new URL(url).pathname.endsWith("_test"))
      throw new Error("A disposable database ending in _test is required");

    this.pool = new Pool({ connectionString: url, max: 2 });
  }

  private table(table: Table) {
    return `"${schemas[table]}"."${table}"`;
  }

  async insert(table: Table, value: Record<string, unknown>) {
    const names = Object.keys(value);
    return (
      await this.pool.query(
        `INSERT INTO ${this.table(table)} (${names.map(column).join(",")}) VALUES (${names.map((_, i) => `$${i + 1}`).join(",")}) RETURNING *`,
        Object.values(value),
      )
    ).rows[0];
  }

  async rows(table: Table, filter: Record<string, unknown> = {}) {
    const keys = Object.keys(filter);
    return (
      await this.pool.query(
        `SELECT * FROM ${this.table(table)}${keys.length ? ` WHERE ${keys.map((key, i) => `${column(key)} = $${i + 1}`).join(" AND ")}` : ""}`,
        Object.values(filter),
      )
    ).rows;
  }

  async update(
    table: Table,
    id: string,
    value: Record<string, unknown>,
    key = "id",
  ) {
    const names = Object.keys(value);
    await this.pool.query(
      `UPDATE ${this.table(table)} SET ${names.map((name, i) => `${column(name)} = $${i + 1}`).join(",")} WHERE ${column(key)} = $${names.length + 1}`,
      [...Object.values(value), id],
    );
  }

  close() {
    return this.pool.end();
  }
}

export function testEnvironment(overrides: Record<string, unknown> = {}) {
  const values = ENV_SCHEMA.parse({
    NODE_ENV: "test",
    AUTH_PROVIDER: "mock",
    PERSISTENCE_RPC_URL: process.env.TEST_PERSISTENCE_RPC_URL,
    PERSISTENCE_RPC_PRIVATE_KEY: process.env.TEST_PERSISTENCE_RPC_PRIVATE_KEY,
    ...overrides,
  });
  return {
    get: (key: keyof typeof values) => values[key],
  } as EnvironmentService;
}

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

  const provider = await db.pool.query(
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

export async function startApi(f: Fixture, mcp = false) {
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
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(EnvironmentService)
    .useValue(f.environment)
    .overrideProvider(MockAuthService)
    .useValue(verifier)
    .compile();
  const app: INestApplication = module.createNestApplication({ logger: false });

  if (mcp) {
    const strategy = app.get<McpStrategy>(MCP_STRATEGY);
    strategy.setHttpAdapter(app.getHttpAdapter());
    app.connectMicroservice({ strategy });
    await app.startAllMicroservices();
  }

  await app.listen(0, "127.0.0.1");
  const url = await app.getUrl();
  const client = (token = f.token) =>
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
