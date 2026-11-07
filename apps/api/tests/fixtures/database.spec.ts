import {
  afterEach,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from "vitest";
import { FixtureDatabase, type FixtureRow } from "./database";

const pg = vi.hoisted(() => ({
  query:
    vi.fn<(sql: string, values: unknown[]) => Promise<{ rows: unknown[] }>>(),
  end: vi.fn<() => Promise<void>>(async () => {}),
}));

vi.mock("pg", async (importOriginal) => ({
  ...(await importOriginal<typeof import("pg")>()),
  Pool: class {
    query = pg.query;
    end = pg.end;
  },
}));

describe("owner fixture SQL and row types", () => {
  beforeEach(() => {
    pg.query.mockReset();
    vi.stubEnv(
      "TEST_POSTGRES_OWNER_URL",
      "postgresql://owner:fixture@localhost/lazyfinance_test",
    );
  });

  afterEach(() => vi.unstubAllEnvs());

  it("parameterizes camel-case write fields and preserves raw pg timestamps/JSON keys", async () => {
    const at = new Date("2026-10-15T15:00:00.000Z");
    const row = {
      id: "saved",
      booked_at: at,
      counterparty_holder: { provider_key: "kept" },
    };
    pg.query.mockResolvedValue({ rows: [row] });
    const database = new FixtureDatabase();
    const saved = await database.insert("transaction", {
      accountId: "account",
      amount: "-1.01",
      type: "debit",
      bookedAt: at,
    });

    expect(pg.query).toHaveBeenCalledWith(
      'INSERT INTO "finance"."transaction" ("account_id","amount","type","booked_at") VALUES ($1,$2,$3,$4) RETURNING *',
      ["account", "-1.01", "debit", at],
    );
    expect(saved).toBe(row);
    expectTypeOf(saved).toEqualTypeOf<FixtureRow<"transaction">>();
    expectTypeOf(saved.booked_at).toEqualTypeOf<Date>();
    expectTypeOf(saved.amount).toEqualTypeOf<string>();
  });

  it("uses a table's explicit non-id key when updating sync state", async () => {
    pg.query.mockResolvedValue({ rows: [] });
    const database = new FixtureDatabase();
    await database.update(
      "provider_sync_state",
      "connection",
      { revision: 2 },
      "providerConnectionId",
    );

    expect(pg.query).toHaveBeenCalledWith(
      'UPDATE "finance"."provider_sync_state" SET "revision" = $1 WHERE "provider_connection_id" = $2',
      [2, "connection"],
    );
  });

  it("rejects non-disposable or missing owner configuration before constructing a pool", () => {
    vi.stubEnv(
      "TEST_POSTGRES_OWNER_URL",
      "postgresql://owner:fixture@localhost/lazyfinance",
    );
    expect(() => new FixtureDatabase()).toThrow(
      "A disposable database ending in _test is required",
    );
    vi.stubEnv("TEST_POSTGRES_OWNER_URL", undefined);
    expect(() => new FixtureDatabase()).toThrow(
      "A disposable database ending in _test is required",
    );
  });

  it("relates table names to columns, representations, result keys and update keys", () => {
    const check = (database: FixtureDatabase) => {
      // Compile-time regression probes only: never submit deliberately invalid SQL.
      // @ts-expect-error Account rows have balances, not movement amounts.
      void database.insert("account", { amount: "1.00" });
      // @ts-expect-error Money remains an exact decimal string.
      void database.insert("transaction", { amount: 1 });
      // @ts-expect-error Filters use camel-case field names, not raw pg result keys.
      void database.rows("transaction", { account_id: "account" });
      // @ts-expect-error Sync-state rows have no default id column.
      void database.update("provider_sync_state", "connection", {
        revision: 2,
      });
      void database.update(
        "account",
        "account",
        { balance: null },
        // @ts-expect-error Explicit keys must exist on the selected table.
        "transactionId",
      );
    };

    expectTypeOf(check).parameter(0).toEqualTypeOf<FixtureDatabase>();
    expectTypeOf<
      FixtureRow<"provider_sync_state">["retry_after"]
    >().toEqualTypeOf<Date | null>();
    expectTypeOf<
      FixtureRow<"income_source">["start_date"]
    >().toEqualTypeOf<string>();
  });
});
