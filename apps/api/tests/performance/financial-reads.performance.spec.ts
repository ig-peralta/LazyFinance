import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { santiagoMonth } from "../../src/utils/santiago-time";
import { fixture, integration, startApi } from "../fixtures/persistence";
import { writePerformanceReport } from "./report";

const rows = 12_000;
const requests = 200;
const concurrency = 8;
const warmup = 16;
const targetP95Ms = 500;

async function measure(name: string, request: () => Promise<unknown>) {
  for (let i = 0; i < warmup; i++) await request();

  const times: number[] = [];
  const failures: string[] = [];
  const started = performance.now();
  await Promise.all(
    Array.from({ length: concurrency }, async (_, worker) => {
      for (let i = worker; i < requests; i += concurrency) {
        const start = performance.now();
        try {
          await request();
          times.push(performance.now() - start);
        } catch (error) {
          failures.push(error instanceof Error ? error.name : "unknown");
        }
      }
    }),
  );
  const elapsedMs = performance.now() - started;
  times.sort((a, b) => a - b);
  const percentile = (fraction: number) =>
    times.length ? times[Math.ceil(times.length * fraction) - 1] : null;
  return {
    route: name,
    requests,
    concurrency,
    warmup,
    successful: times.length,
    errors: failures.length,
    errorKinds: [...new Set(failures)],
    elapsedMs,
    requestsPerSecond: (times.length / elapsedMs) * 1000,
    p50Ms: percentile(0.5),
    p95Ms: percentile(0.95),
    p99Ms: percentile(0.99),
    maxMs: times.at(-1) ?? null,
  };
}

describe("measured authenticated financial reads", () => {
  it("measures four public RPC routes through signed persistence and real PostgreSQL", async () => {
    if (!integration) throw new Error("Use pnpm test:performance");
    const f = await fixture(true);
    const api = await startApi(f);
    try {
      const client = api.client();
      const month = santiagoMonth(new Date());
      const tag = await client.tags.create.mutate({
        name: "Synthetic purchases",
      });
      const budget = await client.objectives.createBudget.mutate({
        name: "Synthetic monthly budget",
        amount: "900000.00",
        tagIds: [tag.id],
        schedule: { period: "monthly", startDate: `${month}-01` },
      });
      const inserted = await f.db.pool.query(
        `INSERT INTO finance.transaction
          (account_id, tag_id, booked_at, amount, type, source, merchant, description,
           is_internal_movement, tag_decision_origin, review_status)
         SELECT $1, CASE WHEN i % 2 = 0 THEN $2::uuid ELSE NULL END,
                now(), '-100.00', 'debit', 'manual', 'Synthetic merchant',
                'Synthetic purchase', false,
                (CASE WHEN i % 2 = 0 THEN 'manual' ELSE 'unreviewed' END)::finance.tag_decision_origin,
                'clear'::finance.movement_review_status
         FROM generate_series(1, $3::integer) AS i`,
        [f.accountId, tag.id, rows],
      );
      expect(inserted.rowCount).toBe(rows);
      expect(await client.accounts.list.query()).toHaveLength(1);
      expect(await client.transactions.recent.query()).toHaveLength(10);
      expect(await client.summaries.monthly.query({ month })).toMatchObject({
        spending: "1200000.00",
      });
      expect(
        (await client.objectives.progress.query({ month })).find(
          (item) => item.id === budget.id,
        ),
      ).toMatchObject({ spent: "600000.00" });

      const results = [];
      for (const [name, request] of [
        ["accounts.list", () => client.accounts.list.query()],
        ["transactions.recent", () => client.transactions.recent.query()],
        ["summaries.monthly", () => client.summaries.monthly.query({ month })],
        [
          "objectives.progress",
          () => client.objectives.progress.query({ month }),
        ],
      ] as const)
        results.push(await measure(name, request));

      const passed = results.every(
        (result) =>
          result.errors === 0 &&
          result.successful === requests &&
          result.p95Ms !== null &&
          result.p95Ms < targetP95Ms,
      );
      writePerformanceReport("financial-reads", {
        outcome: passed ? "passed" : "failed",
        criteria: { targetP95Ms, maximumErrors: 0 },
        dataset: {
          owners: 2,
          measuredOwnerAccounts: 1,
          measuredOwnerMovements: rows,
          currentMonth: month,
          movementAmountCLP: "-100.00",
          taggedMovements: rows / 2,
          budgets: 1,
          origin: "synthetic owner-only SQL setup, not part of timed intervals",
        },
        results,
      });
      expect(
        passed,
        "Read p95 or request-error criterion failed; inspect report",
      ).toBe(true);
    } finally {
      await api.app.close();
      await f.db.close();
    }
  });
});
