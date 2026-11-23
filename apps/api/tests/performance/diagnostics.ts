import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { vi } from "vitest";

function numberFromFile(path: string): number | null {
  try {
    const value = Number(readFileSync(path, "utf8").trim());
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function namedNumbers(path: string): Record<string, number> {
  try {
    return Object.fromEntries(
      readFileSync(path, "utf8")
        .trim()
        .split("\n")
        .map((line) => {
          const [name, value] = line.split(" ");
          return [name, Number(value)];
        }),
    );
  } catch {
    return {};
  }
}

export function resourceSnapshot() {
  return {
    cgroupCpu: namedNumbers("/sys/fs/cgroup/cpu.stat"),
    memoryCurrentBytes: numberFromFile("/sys/fs/cgroup/memory.current"),
    memoryPeakSinceContainerStartBytes: numberFromFile(
      "/sys/fs/cgroup/memory.peak",
    ),
    memoryEvents: namedNumbers("/sys/fs/cgroup/memory.events"),
    workerCpu: process.cpuUsage(),
    workerMemory: process.memoryUsage(),
  };
}

type ResourceSnapshot = ReturnType<typeof resourceSnapshot>;

function difference(after?: number, before?: number): number | null {
  return after === undefined || before === undefined ? null : after - before;
}

export function resourceDifference(
  before: ResourceSnapshot,
  after: ResourceSnapshot,
) {
  const cpuUsec = difference(
    after.cgroupCpu.usage_usec,
    before.cgroupCpu.usage_usec,
  );
  const throttledUsec = difference(
    after.cgroupCpu.throttled_usec,
    before.cgroupCpu.throttled_usec,
  );
  return {
    runnerCgroup: {
      // Includes this Vitest worker and the compiled persistence server, not PostgreSQL.
      cpuMs: cpuUsec === null ? null : cpuUsec / 1000,
      throttledMs: throttledUsec === null ? null : throttledUsec / 1000,
      throttledPeriods: difference(
        after.cgroupCpu.nr_throttled,
        before.cgroupCpu.nr_throttled,
      ),
      memoryStartBytes: before.memoryCurrentBytes,
      memoryEndBytes: after.memoryCurrentBytes,
      memoryPeakSinceContainerStartBytes:
        after.memoryPeakSinceContainerStartBytes,
      oomKills: difference(
        after.memoryEvents.oom_kill,
        before.memoryEvents.oom_kill,
      ),
    },
    testWorker: {
      cpuMs:
        (after.workerCpu.user +
          after.workerCpu.system -
          before.workerCpu.user -
          before.workerCpu.system) /
        1000,
      rssStartBytes: before.workerMemory.rss,
      rssEndBytes: after.workerMemory.rss,
      heapUsedStartBytes: before.workerMemory.heapUsed,
      heapUsedEndBytes: after.workerMemory.heapUsed,
    },
  };
}

export function errorDetails(error: unknown) {
  return {
    kind: error instanceof Error ? error.name : "unknown",
    message: error instanceof Error ? error.message.slice(0, 240) : null,
  };
}

export function percentile(sorted: number[], fraction: number) {
  return sorted.length ? sorted[Math.ceil(sorted.length * fraction) - 1] : null;
}

export type RpcSpan = {
  procedure: string;
  startedAtMs: number;
  durationMs: number;
  status: number | null;
  errorKind: string | null;
  requestBytes: number | null;
};

/** Test-only fetch observation; never changes RPC requests, responses or production code. */
export function observePrivateRpc(baseUrl: string) {
  const base = new URL(baseUrl.replace(/\/$/, ""));
  const prefix = `${base.pathname.replace(/\/$/, "")}/trpc/`;
  const spans: RpcSpan[] = [];
  const originalFetch = globalThis.fetch;
  const spy = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (input, init) => {
      const url = new URL(
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
      );
      if (url.origin !== base.origin || !url.pathname.startsWith(prefix))
        return originalFetch(input, init);

      const startedAtMs = performance.now();
      let status: number | null = null;
      let errorKind: string | null = null;
      try {
        const response = await originalFetch(input, init);
        status = response.status;
        return response;
      } catch (error) {
        errorKind = errorDetails(error).kind;
        throw error;
      } finally {
        spans.push({
          procedure: url.pathname.slice(prefix.length),
          startedAtMs,
          durationMs: performance.now() - startedAtMs,
          status,
          errorKind,
          requestBytes:
            typeof init?.body === "string"
              ? Buffer.byteLength(init.body)
              : null,
        });
      }
    });
  return { spans, stop: () => spy.mockRestore() };
}

export function summarizeRpc(spans: RpcSpan[]) {
  const procedures = [...new Set(spans.map((span) => span.procedure))].sort();
  return procedures.map((procedure) => {
    const calls = spans.filter((span) => span.procedure === procedure);
    const times = calls.map((call) => call.durationMs).sort((a, b) => a - b);
    return {
      procedure,
      calls: calls.length,
      non2xx: calls.filter((call) => call.status === null || call.status >= 300)
        .length,
      statuses: [...new Set(calls.map((call) => call.status))],
      p50Ms: percentile(times, 0.5),
      p95Ms: percentile(times, 0.95),
      maxMs: times.at(-1) ?? null,
      sumMs: times.reduce((sum, time) => sum + time, 0),
      requestBytes: calls.reduce(
        (sum, call) => sum + (call.requestBytes ?? 0),
        0,
      ),
    };
  });
}
