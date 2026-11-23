// Loaded only by the isolated Compose profile, never by a production entrypoint.
const { createHash } = require("node:crypto");
const {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
} = require("node:fs");
const { createRequire } = require("node:module");
const { join } = require("node:path");
const { performance } = require("node:perf_hooks");

if (process.argv[1]?.endsWith("apps/persistence/dist/main.js")) {
  const run = process.env.PERF_REPORT_FILE;
  if (
    !run ||
    !/^[\w-]+$/.test(run) ||
    !new URL(process.env.POSTGRES_RUNTIME_URL).pathname.endsWith("_test")
  )
    throw new Error(
      "SQL observation is restricted to the isolated performance database",
    );
  const directory = join("/results", run);
  mkdirSync(directory, { recursive: true });
  const { Client } = createRequire(
    join(process.cwd(), "apps/persistence/package.json"),
  )("pg");
  const original = Client.prototype.query;
  const scopes = new WeakMap();
  const captured = new Set();
  const write = (file, value) => {
    appendFileSync(join(directory, file), `${JSON.stringify(value)}\n`);
  };
  const target = (sql) => {
    if (!sql.startsWith("select ")) return null;
    if (
      sql.includes('from "finance"."transaction" as "m"') &&
      sql.includes("group by") &&
      sql.includes('"t"."id"')
    )
      return "transactions.taggedAggregates";
    if (
      sql.includes('from "finance"."transaction" as "m"') &&
      sql.includes('order by "m"."booked_at" desc') &&
      sql.includes(" limit ")
    )
      return "transactions.recent";
    if (sql.includes("jsonb_to_recordset") && sql.includes("sum(m.amount)"))
      return "objectives.spending";
    return null;
  };
  Client.prototype.query = function (...args) {
    // Kysely's promise form only. Other pg overloads retain their original behavior.
    if (
      typeof args[0] !== "string" ||
      args.some((arg) => typeof arg === "function")
    )
      return original.apply(this, args);
    const sql = args[0];
    if (/^begin\b/i.test(sql))
      scopes.set(this, {
        startedAt: new Date().toISOString(),
        start: performance.now(),
        statements: new Map(),
      });
    const scope = scopes.get(this);
    if (scope && sql.includes("set_config('lazyfinance.context_kind'")) {
      [scope.kind, scope.userId, scope.requestId] = args[1];
    }
    const started = performance.now();
    const execute = async () => {
      const procedure = scope && target(sql);
      const marker = join(directory, "capture-plans.json");
      if (procedure && existsSync(marker)) {
        const config = JSON.parse(readFileSync(marker, "utf8"));
        const key = `${config.profile}:${procedure}`;
        if (config.userId === scope.userId && !captured.has(key)) {
          captured.add(key);
          await original.call(this, "savepoint performance_plan");
          try {
            await original.call(this, "set local statement_timeout = '8s'");
            const result = await original.call(
              this,
              `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON, TIMING OFF) ${sql}`,
              args[1],
            );
            write("sql-plans.ndjson", {
              profile: config.profile,
              procedure,
              userId: scope.userId,
              capturedAt: new Date().toISOString(),
              sql,
              plan: result.rows[0]["QUERY PLAN"],
            });
          } catch (error) {
            await original.call(this, "rollback to savepoint performance_plan");
            write("sql-plans.ndjson", {
              profile: config.profile,
              procedure,
              error: error.message,
            });
          } finally {
            await original.call(this, "release savepoint performance_plan");
            await original.call(this, "set local statement_timeout = '20s'");
          }
        }
      }
      return original.apply(this, args);
    };
    return execute().then(
      (result) => {
        if (scope) record(result.rowCount, null);
        return result;
      },
      (error) => {
        if (scope) record(0, error.code || error.name);
        throw error;
      },
    );
    function record(rows, error) {
      const key = createHash("sha256").update(sql).digest("hex").slice(0, 16);
      let group = scope.statements.get(key);
      if (!group) {
        group = {
          key,
          sql: sql.slice(0, 240),
          calls: 0,
          clientSqlMs: 0,
          maxMs: 0,
          rows: 0,
          errors: 0,
        };
        scope.statements.set(key, group);
      }
      const elapsed = performance.now() - started;
      group.calls++;
      group.clientSqlMs += elapsed;
      group.maxMs = Math.max(group.maxMs, elapsed);
      group.rows += rows || 0;
      if (error) group.errors++;
      if (/^(commit|rollback)\b/i.test(sql)) {
        write("sql-transactions.ndjson", {
          requestId: scope.requestId,
          userId: scope.userId,
          kind: scope.kind,
          startedAt: scope.startedAt,
          endedAt: new Date().toISOString(),
          durationMs: performance.now() - scope.start,
          outcome: /^commit/i.test(sql) && !error ? "committed" : "rolled-back",
          statements: [...scope.statements.values()],
        });
      }
    }
  };
}
