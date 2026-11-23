import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { FixtureDatabase } from "../fixtures/database";
import { errorDetails } from "./diagnostics";

export async function prepareSqlStatistics(db: FixtureDatabase) {
  const run = process.env.PERF_REPORT_FILE;
  if (
    !run ||
    !/^[\w-]+$/.test(run) ||
    !existsSync(join("/results", run, "observer-ready"))
  )
    throw new Error("The isolated persistence SQL observer did not start");
  await db.pool.query("CREATE EXTENSION IF NOT EXISTS pg_stat_statements");
}

export async function resetSqlStatistics(db: FixtureDatabase) {
  await db.pool.query("SELECT pg_stat_statements_reset()");
}

export async function sqlStatistics(
  db: FixtureDatabase,
  phase = "measured window, reset after warm-up",
) {
  const result = await db.pool.query<{
    queryId: string;
    sql: string;
    calls: number;
    planMs: number;
    executionMs: number;
    maxExecutionMs: number;
    rows: string;
    sharedBlocksHit: string;
    sharedBlocksRead: string;
    tempBlocksWritten: string;
    walBytes: string;
  }>(`SELECT queryid::text AS "queryId", left(query, 1000) AS sql,
    calls::float8 AS calls, total_plan_time AS "planMs", total_exec_time AS "executionMs",
    max_exec_time AS "maxExecutionMs", rows::text AS rows,
    shared_blks_hit::text AS "sharedBlocksHit", shared_blks_read::text AS "sharedBlocksRead",
    temp_blks_written::text AS "tempBlocksWritten", wal_bytes::text AS "walBytes"
    FROM pg_stat_statements WHERE userid = (SELECT oid FROM pg_roles WHERE rolname = 'lazyfinance_test_runtime')
    ORDER BY total_exec_time + total_plan_time DESC LIMIT 20`);
  return {
    source: `pg_stat_statements, runtime login, ${phase}; PostgreSQL time excludes transport`,
    statements: result.rows,
  };
}

/** Capture the actual prepared SELECTs inside their real restricted RLS transaction. */
export async function captureReadPlans(
  profile: string,
  userId: string,
  requests: (() => Promise<unknown>)[],
) {
  const run = process.env.PERF_REPORT_FILE;
  if (!run || !/^[\w-]+$/.test(run))
    throw new Error("Use the isolated performance runner");
  const directory = join("/results", run);
  mkdirSync(directory, { recursive: true });
  const marker = join(directory, "capture-plans.json");
  const failures = [];
  writeFileSync(marker, JSON.stringify({ profile, userId }));
  try {
    for (const request of requests) {
      try {
        await request();
      } catch (error) {
        failures.push(errorDetails(error));
      }
    }
  } finally {
    rmSync(marker);
  }
  let plans: unknown[] = [];
  try {
    plans = readFileSync(join(directory, "sql-plans.ndjson"), "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .filter((item) => item.profile === profile);
  } catch (error) {
    failures.push(errorDetails(error));
  }
  return {
    outsideMeasuredWindow: true,
    source:
      "EXPLAIN (ANALYZE, BUFFERS, TIMING OFF) with actual query parameters and runtime RLS; 8s plan deadline",
    plans,
    failures,
  };
}
