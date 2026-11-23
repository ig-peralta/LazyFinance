import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function cgroup(path: string) {
  try {
    return readFileSync(path, "utf8").trim();
  } catch {
    return "unavailable";
  }
}

export function writePerformanceReport(
  name: string,
  details: Record<string, unknown>,
) {
  const file = process.env.PERF_REPORT_FILE;
  const sha = process.env.PERF_GIT_SHA;
  if (!file || !/^[\w-]+$/.test(file) || !sha || !/^[0-9a-f]{40}$/.test(sha))
    throw new Error("Use the isolated pnpm test:performance runner");
  const directory = join("/results", file);
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    join(directory, `${name}.json`),
    `${JSON.stringify(
      {
        measuredAt: new Date().toISOString(),
        gitCommit: sha,
        nodeVersion: process.version,
        environment: {
          kind: "synthetic-isolated-docker",
          runner: {
            cpus: process.env.PERF_RUNNER_CPUS,
            memory: process.env.PERF_RUNNER_MEMORY,
            cpuMax: cgroup("/sys/fs/cgroup/cpu.max"),
            memoryMax: cgroup("/sys/fs/cgroup/memory.max"),
          },
          postgres: {
            image: "postgres:18-alpine",
            cpus: process.env.PERF_POSTGRES_CPUS,
            memory: process.env.PERF_POSTGRES_MEMORY,
            storage: "512 MiB tmpfs",
          },
          network: "internal Docker bridge, no published ports",
        },
        ...details,
      },
      null,
      2,
    )}\n`,
  );
}
