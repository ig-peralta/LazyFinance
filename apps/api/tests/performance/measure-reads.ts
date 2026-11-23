import { performance } from "node:perf_hooks";
import type { FixtureDatabase } from "../fixtures/database";
import {
  errorDetails,
  observePrivateRpc,
  percentile,
  resourceDifference,
  resourceSnapshot,
  summarizeRpc,
} from "./diagnostics";
import { resetSqlStatistics, sqlStatistics } from "./sql-diagnostics";

export const readCriteria = {
  requests: 200,
  concurrency: 8,
  authenticatedOwners: 8,
  requestsPerOwner: 25,
  warmup: 16,
  targetP95Ms: 500,
  maximumErrors: 0,
};

type Caller = {
  owner: number;
  userId: string;
  request: () => Promise<unknown>;
};

export async function measureReads(
  route: string,
  callers: Caller[],
  privateUrl: string,
  db: FixtureDatabase,
) {
  if (
    callers.length !== readCriteria.concurrency ||
    new Set(callers.map((caller) => caller.userId)).size !==
      readCriteria.authenticatedOwners
  )
    throw new Error(
      "Each concurrent caller must have a different financial owner",
    );
  const observer = observePrivateRpc(privateUrl);
  const successes: {
    owner: number;
    worker: number;
    offsetMs: number;
    durationMs: number;
  }[] = [];
  const failures: {
    owner: number;
    worker: number;
    offsetMs: number;
    durationMs: number;
    error: ReturnType<typeof errorDetails>;
  }[] = [];
  const preflight = {
    completed: 0,
    durationMs: 0,
    error: null as ReturnType<typeof errorDetails> | null,
  };
  const warmup = {
    requested: readCriteria.warmup,
    completed: 0,
    durationMs: 0,
    error: null as ReturnType<typeof errorDetails> | null,
  };
  let timedStarted: number | null = null;
  let startedAt: string | null = null;
  let endedAt: string | null = null;
  let elapsedMs = 0,
    overTarget = 0;
  let resources: ReturnType<typeof resourceDifference> | null = null;
  let sql: Awaited<ReturnType<typeof sqlStatistics>> | null = null;
  try {
    await resetSqlStatistics(db);
    const start = performance.now();
    await Promise.all(
      callers.map(async (caller) => {
        try {
          await caller.request();
          preflight.completed++;
        } catch (error) {
          preflight.error ??= errorDetails(error);
        }
      }),
    );
    preflight.durationMs = performance.now() - start;
    if (!preflight.error) {
      const start = performance.now();
      await Promise.all(
        callers.map(async (caller) => {
          for (
            let i = 0;
            i < readCriteria.warmup / callers.length && !warmup.error;
            i++
          ) {
            try {
              await caller.request();
              warmup.completed++;
            } catch (error) {
              warmup.error ??= errorDetails(error);
            }
          }
        }),
      );
      warmup.durationMs = performance.now() - start;
    }
    if (!preflight.error && !warmup.error) {
      await resetSqlStatistics(db);
      const before = resourceSnapshot();
      const timedStart = performance.now();
      timedStarted = timedStart;
      startedAt = new Date().toISOString();
      let stop = false;
      await Promise.all(
        callers.map(async (caller, worker) => {
          for (let i = 0; i < readCriteria.requestsPerOwner && !stop; i++) {
            const start = performance.now();
            try {
              await caller.request();
              const durationMs = performance.now() - start;
              successes.push({
                owner: caller.owner,
                worker,
                offsetMs: start - timedStart,
                durationMs,
              });
              if (
                durationMs >= readCriteria.targetP95Ms &&
                ++overTarget > readCriteria.requests * 0.05
              )
                stop = true;
            } catch (error) {
              failures.push({
                owner: caller.owner,
                worker,
                offsetMs: start - timedStart,
                durationMs: performance.now() - start,
                error: errorDetails(error),
              });
              stop = true;
            }
          }
        }),
      );
      elapsedMs = performance.now() - timedStart;
      endedAt = new Date().toISOString();
      resources = resourceDifference(before, resourceSnapshot());
      sql = await sqlStatistics(db);
    } else {
      sql = await sqlStatistics(
        db,
        "preflight/warm-up; no timed acceptance samples",
      );
    }
  } finally {
    observer.stop();
  }
  const times = successes
    .map((sample) => sample.durationMs)
    .sort((a, b) => a - b);
  return {
    route,
    stage: preflight.error
      ? "preflight-failed"
      : warmup.error
        ? "warmup-failed"
        : "measured",
    requested: readCriteria.requests,
    concurrency: callers.length,
    authenticatedOwners: callers.length,
    preflight,
    warmup,
    startedAt,
    endedAt,
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
      successes.length + failures.length < readCriteria.requests &&
      !preflight.error &&
      !warmup.error,
    latencyBucketsMs: [25, 50, 100, 250, 500, 1000].map((below, i, bounds) => ({
      below,
      count: times.filter(
        (time) => time >= (bounds[i - 1] ?? 0) && time < below,
      ).length,
    })),
    latencyAtLeast1000Ms: times.filter((time) => time >= 1000).length,
    samples: successes,
    owners: callers.map((caller) => {
      const samples = successes
        .filter((sample) => sample.owner === caller.owner)
        .map((sample) => sample.durationMs)
        .sort((a, b) => a - b);
      const errors = failures.filter(
        (sample) => sample.owner === caller.owner,
      ).length;
      return {
        owner: caller.owner,
        userId: caller.userId,
        requested: readCriteria.requestsPerOwner,
        attempted: samples.length + errors,
        successful: samples.length,
        errors,
        p50Ms: percentile(samples, 0.5),
        p95Ms: percentile(samples, 0.95),
      };
    }),
    privateRpc: {
      preflightAndWarmup: summarizeRpc(
        observer.spans.filter(
          (span) => timedStarted === null || span.startedAtMs < timedStarted,
        ),
      ),
      measured: summarizeRpc(
        observer.spans.filter(
          (span) =>
            timedStarted !== null &&
            span.startedAtMs >= timedStarted &&
            span.startedAtMs < timedStarted + elapsedMs,
        ),
      ),
    },
    resources,
    sql,
  };
}
