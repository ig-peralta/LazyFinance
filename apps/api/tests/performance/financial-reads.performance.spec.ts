import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { santiagoMonth } from "../../src/utils/santiago-time";
import { fixture, integration, startApi } from "../fixtures/persistence";
import {
  errorDetails,
  observePrivateRpc,
  percentile,
  resourceDifference,
  resourceSnapshot,
  summarizeRpc,
} from "./diagnostics";
import { writePerformanceReport } from "./report";

const rows = 12_000;
const requests = 200;
const concurrency = 8;
const warmup = 16;
const targetP95Ms = 500;

async function measure(
  name: string,
  request: () => Promise<unknown>,
  verify: () => Promise<void>,
  privateUrl: string,
) {
  const observer = observePrivateRpc(privateUrl);
  const preflightStarted = performance.now();
  let preflightDurationMs = 0;
  let preflightError: ReturnType<typeof errorDetails> | null = null;
  let warmupError: ReturnType<typeof errorDetails> | null = null;
  let warmupCompleted = 0;
  let warmupDurationMs = 0;
  let timedStarted: number | null = null;
  let elapsedMs = 0;
  let overTarget = 0;
  let resources: ReturnType<typeof resourceDifference> | null = null;
  const successes: { worker: number; offsetMs: number; durationMs: number }[] =
    [];
  const failures: {
    worker: number;
    offsetMs: number;
    durationMs: number;
    error: ReturnType<typeof errorDetails>;
  }[] = [];

  try {
    try {
      await verify();
    } catch (error) {
      preflightError = errorDetails(error);
    }
    preflightDurationMs = performance.now() - preflightStarted;
    if (!preflightError) {
      const started = performance.now();
      for (let i = 0; i < warmup; i++) {
        try {
          await request();
          warmupCompleted++;
        } catch (error) {
          warmupError = errorDetails(error);
          break;
        }
      }
      warmupDurationMs = performance.now() - started;
    }

    if (!preflightError && !warmupError) {
      const before = resourceSnapshot();
      const timedStart = performance.now();
      timedStarted = timedStart;
      let stop = false;
      try {
        await Promise.all(
          Array.from({ length: concurrency }, async (_, worker) => {
            for (let i = worker; i < requests && !stop; i += concurrency) {
              const started = performance.now();
              try {
                await request();
                const durationMs = performance.now() - started;
                successes.push({
                  worker,
                  offsetMs: started - timedStart,
                  durationMs,
                });
                if (durationMs >= targetP95Ms && ++overTarget > requests * 0.05)
                  stop = true;
              } catch (error) {
                failures.push({
                  worker,
                  offsetMs: started - timedStart,
                  durationMs: performance.now() - started,
                  error: errorDetails(error),
                });
                // Zero errors is the criterion; drain in-flight work but issue no more.
                stop = true;
              }
            }
          }),
        );
      } finally {
        elapsedMs = performance.now() - timedStart;
        resources = resourceDifference(before, resourceSnapshot());
      }
    }
  } finally {
    observer.stop();
  }

  const times = successes
    .map((sample) => sample.durationMs)
    .sort((a, b) => a - b);
  const timedRpc = observer.spans.filter(
    (span) =>
      timedStarted !== null &&
      span.startedAtMs >= timedStarted &&
      span.startedAtMs < timedStarted + elapsedMs,
  );
  return {
    route: name,
    stage: preflightError
      ? "preflight-failed"
      : warmupError
        ? "warmup-failed"
        : "measured",
    requested: requests,
    concurrency,
    preflight: { durationMs: preflightDurationMs, error: preflightError },
    warmup: {
      requested: warmup,
      completed: warmupCompleted,
      durationMs: warmupDurationMs,
      error: warmupError,
    },
    attempted: successes.length + failures.length,
    successful: successes.length,
    errors: failures.length,
    failureSamples: failures,
    elapsedMs,
    successfulPerSecond: elapsedMs
      ? (successes.length / elapsedMs) * 1000
      : null,
    p50Ms: percentile(times, 0.5),
    p95Ms: percentile(times, 0.95),
    p99Ms: percentile(times, 0.99),
    maxMs: times.at(-1) ?? null,
    overTarget,
    stoppedEarly:
      successes.length + failures.length < requests &&
      !preflightError &&
      !warmupError,
    latencyBucketsMs: [25, 50, 100, 250, 500, 1000].map(
      (upper, index, bounds) => ({
        below: upper,
        count: times.filter(
          (time) => time >= (bounds[index - 1] ?? 0) && time < upper,
        ).length,
      }),
    ),
    latencyAtLeast1000Ms: times.filter((time) => time >= 1000).length,
    samples: successes,
    privateRpc: {
      preflightAndWarmup: summarizeRpc(
        observer.spans.filter(
          (span) => timedStarted === null || span.startedAtMs < timedStarted,
        ),
      ),
      measured: summarizeRpc(timedRpc),
    },
    resources,
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
      const results = [];
      const criteria = { targetP95Ms, maximumErrors: 0, requests, concurrency };
      const dataset = {
        owners: 2,
        measuredOwnerAccounts: 1,
        measuredOwnerMovements: rows,
        currentMonth: month,
        movementAmountCLP: "-100.00",
        taggedMovements: rows / 2,
        budgets: 1,
        origin: "synthetic owner-only SQL setup, not part of timed intervals",
      };
      // Diagnose all four routes even if one cannot meet its acceptance criteria.
      for (const [name, request, verify] of [
        [
          "accounts.list",
          () => client.accounts.list.query(),
          async () => {
            expect(await client.accounts.list.query()).toHaveLength(1);
          },
        ],
        [
          "transactions.recent",
          () => client.transactions.recent.query(),
          async () => {
            expect(await client.transactions.recent.query()).toHaveLength(10);
          },
        ],
        [
          "summaries.monthly",
          () => client.summaries.monthly.query({ month }),
          async () => {
            expect(
              await client.summaries.monthly.query({ month }),
            ).toMatchObject({ spending: "1200000.00" });
          },
        ],
        [
          "objectives.progress",
          () => client.objectives.progress.query({ month }),
          async () => {
            expect(
              (await client.objectives.progress.query({ month })).find(
                (item) => item.id === budget.id,
              ),
            ).toMatchObject({ spent: "600000.00" });
          },
        ],
      ] as const) {
        const result = await measure(
          name,
          request,
          verify,
          f.environment.get("PERSISTENCE_RPC_URL"),
        );
        results.push(result);
        // Preserve completed routes even if a later route fails or times out.
        writePerformanceReport("financial-reads", {
          outcome: "incomplete",
          criteria,
          dataset,
          results,
        });
      }

      const passed =
        results.length === 4 &&
        results.every(
          (result) =>
            result.stage === "measured" &&
            result.errors === 0 &&
            result.successful === requests &&
            result.p95Ms !== null &&
            result.p95Ms < targetP95Ms,
        );
      writePerformanceReport("financial-reads", {
        outcome: passed ? "passed" : "failed",
        criteria,
        dataset,
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
  }, 180_000);
});
