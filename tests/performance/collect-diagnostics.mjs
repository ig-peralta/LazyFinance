import { spawn } from "node:child_process";
import { once } from "node:events";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { stripVTControlCharacters } from "node:util";

function memoryBytes(value) {
  const match = value.match(/^([\d.]+)([KMGT]?i?B)/);
  if (!match) return null;
  const units = {
    B: 1,
    kB: 1e3,
    MB: 1e6,
    GB: 1e9,
    TB: 1e12,
    KiB: 1024,
    MiB: 1024 ** 2,
    GiB: 1024 ** 3,
    TiB: 1024 ** 4,
  };
  return Number(match[1]) * units[match[2]];
}

export function captureResources(containerIds, directory) {
  const samples = [];
  const errors = [];
  const child = spawn(
    "docker",
    ["stats", "--no-trunc", "--format", "{{json .}}", ...containerIds],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  let pending = "";
  child.stdout.on("data", (chunk) => {
    pending += chunk;
    const lines = pending.split("\n");
    pending = lines.pop();
    // Docker's streaming renderer emits cursor controls even with a JSON template.
    // Each stats record is a flat JSON object; terminal-only lines are not errors.
    const records = lines.flatMap(
      (line) => stripVTControlCharacters(line).match(/\{[^{}]*\}/g) ?? [],
    );
    for (const line of records) {
      try {
        const value = JSON.parse(line);
        const sample = {
          at: new Date().toISOString(),
          service: value.Name.endsWith("-postgres-1") ? "postgres" : "runner",
          cpuPercent: Number.parseFloat(value.CPUPerc),
          memoryBytes: memoryBytes(value.MemUsage),
          memory: value.MemUsage,
        };
        samples.push(sample);
        appendFileSync(
          join(directory, "container-resources.ndjson"),
          `${JSON.stringify(sample)}\n`,
        );
      } catch (error) {
        if (errors.length < 20) errors.push(error.message);
      }
    }
  });
  child.stderr.on("data", (chunk) => errors.push(String(chunk).trim()));
  child.on("error", (error) => errors.push(error.message));
  const closed = once(child, "close").catch(() => undefined);
  return {
    samples,
    errors,
    stop: async () => {
      child.kill("SIGTERM");
      await closed;
    },
  };
}

function windowResources(samples, start, end) {
  return Object.fromEntries(
    ["runner", "postgres"].map((service) => {
      const selected = samples.filter(
        (sample) =>
          sample.service === service && sample.at >= start && sample.at <= end,
      );
      return [
        service,
        {
          samples: selected.length,
          meanCpuPercent: selected.length
            ? selected.reduce((sum, sample) => sum + sample.cpuPercent, 0) /
              selected.length
            : null,
          maxCpuPercent: selected.length
            ? Math.max(...selected.map((sample) => sample.cpuPercent))
            : null,
          maxObservedMemoryBytes: selected.length
            ? Math.max(...selected.map((sample) => sample.memoryBytes ?? 0))
            : null,
        },
      ];
    }),
  );
}

function sqlWindow(transactions, start, end) {
  const selected = transactions.filter(
    (transaction) =>
      transaction.startedAt >= start && transaction.endedAt <= end,
  );
  const statements = new Map();
  for (const transaction of selected)
    for (const statement of transaction.statements) {
      if (!statements.has(statement.key))
        statements.set(statement.key, {
          ...statement,
          calls: 0,
          clientSqlMs: 0,
          rows: 0,
          errors: 0,
          maxMs: 0,
        });
      const group = statements.get(statement.key);
      for (const key of ["calls", "clientSqlMs", "rows", "errors"])
        group[key] += statement[key];
      group.maxMs = Math.max(group.maxMs, statement.maxMs);
    }
  return {
    transactions: selected.length,
    source:
      "Test-only pg client observation; includes SQL transport/decoding, not pure PostgreSQL execution time",
    statements: [...statements.values()]
      .sort((a, b) => b.clientSqlMs - a.clientSqlMs)
      .slice(0, 15),
  };
}

export function attachDiagnostics(record, directory, resources) {
  const path = join(directory, "sql-transactions.ndjson");
  const transactions = existsSync(path)
    ? readFileSync(path, "utf8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line))
    : [];
  const attach = (window) => {
    if (!window?.startedAt || !window?.endedAt) return;
    window.containers = windowResources(
      resources.samples,
      window.startedAt,
      window.endedAt,
    );
    window.persistence = sqlWindow(
      transactions,
      window.startedAt,
      window.endedAt,
    );
  };
  for (const profile of record.profiles ?? [])
    for (const result of profile.results) attach(result);
  for (const result of record.results ?? []) attach(result);
  attach(record.result);
  return {
    ...record,
    resourceSampling: {
      source:
        "docker stats, approximately 2-second samples; not continuous peaks",
      samples: resources.samples.length,
      errors: resources.errors,
    },
  };
}
