import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import type { ConnectorPage } from "../../src/banking/connector/normalized-banking.schema";
import { BankingIngestionService } from "../../src/banking/ingestion/banking-ingestion.service";
import { fixture, integration } from "../fixtures/persistence";
import {
  errorDetails,
  observePrivateRpc,
  resourceDifference,
  resourceSnapshot,
  summarizeRpc,
} from "./diagnostics";
import { writePerformanceReport } from "./report";
import {
  prepareSqlStatistics,
  resetSqlStatistics,
  sqlStatistics,
} from "./sql-diagnostics";

const movements = 49_999;

function timeline(
  started: number,
  durationMs: number,
  spans: { name: string; startedAtMs: number; durationMs: number }[],
) {
  const result: { name: string; offsetMs: number; durationMs: number }[] = [];
  let cursor = 0;
  for (const span of spans.sort((a, b) => a.startedAtMs - b.startedAtMs)) {
    const offsetMs = span.startedAtMs - started;
    if (offsetMs > cursor)
      result.push({
        name: "client work / response decoding",
        offsetMs: cursor,
        durationMs: offsetMs - cursor,
      });
    result.push({ name: span.name, offsetMs, durationMs: span.durationMs });
    cursor = Math.max(cursor, offsetMs + span.durationMs);
  }
  if (durationMs > cursor)
    result.push({
      name: "client work / response decoding",
      offsetMs: cursor,
      durationMs: durationMs - cursor,
    });
  return result;
}

describe("measured near-limit provider import", () => {
  it("attempts one 50,000-record run through signed persistence and real PostgreSQL", async () => {
    if (!integration) throw new Error("Use pnpm test:performance");
    const f = await fixture();
    try {
      const page: ConnectorPage = {
        kind: "page",
        observedAt: "2026-10-31T18:00:00.000Z",
        complete: true,
        nextCursor: null,
        checkpoint: "synthetic-2026-10",
        removedMovements: [],
        accounts: [
          {
            externalId: "synthetic-checking",
            type: "checking",
            currency: "CLP",
            number: null,
            holderName: null,
            reportedBalance: {
              amount: "1000000.00",
              meaning: "cash_balance",
              asOf: "2026-10-31T18:00:00.000Z",
            },
            historyCoverage: {
              completeness: "partial",
              from: "2026-10-01",
              through: "2026-10-31",
            },
          },
        ],
        movements: Array.from({ length: movements }, (_, i) => ({
          accountExternalId: "synthetic-checking",
          externalId: `synthetic-${i}`,
          booked: { precision: "instant", at: "2026-10-15T12:00:00.000Z" },
          amount: "-100.00",
          description: "Synthetic purchase",
          merchant: "Synthetic merchant",
          providerUpdatedAt: null,
          providerKind: "other",
          relatedMovement: null,
          counterpartyHolder: null,
        })),
      };
      const normalizedBytes = Buffer.byteLength(JSON.stringify(page));
      await prepareSqlStatistics(f.db);
      await resetSqlStatistics(f.db);
      const observer = observePrivateRpc(
        f.environment.get("PERSISTENCE_RPC_URL"),
      );
      const fetchPageSpans: {
        name: string;
        startedAtMs: number;
        durationMs: number;
      }[] = [];
      const before = resourceSnapshot();
      const startedAt = new Date().toISOString();
      const started = performance.now();
      let outcome: { status: string; reason?: string } | null = null;
      let error: ReturnType<typeof errorDetails> | null = null;
      try {
        outcome = await new BankingIngestionService(f.persistence).syncForUser(
          f.userId,
          f.connectionId,
          {
            provider: "fixture-bank",
            fetchPage: async () => {
              const fetchedAt = performance.now();
              try {
                return page;
              } finally {
                fetchPageSpans.push({
                  name: "synthetic connector fetchPage",
                  startedAtMs: fetchedAt,
                  durationMs: performance.now() - fetchedAt,
                });
              }
            },
          },
        );
      } catch (cause) {
        error = errorDetails(cause);
      } finally {
        observer.stop();
      }
      const durationMs = performance.now() - started;
      const endedAt = new Date().toISOString();
      const resources = resourceDifference(before, resourceSnapshot());
      const sql = await sqlStatistics(f.db);
      let persistedMovements: number | null = null;
      let verificationError: ReturnType<typeof errorDetails> | null = null;
      try {
        const stored = await f.db.pool.query<{ count: string }>(
          `SELECT count(*)::text AS count FROM finance.transaction t
           JOIN finance.account a ON a.id = t.account_id
           WHERE a.provider_connection_id = $1`,
          [f.connectionId],
        );
        persistedMovements = Number(stored.rows[0].count);
      } catch (cause) {
        verificationError = errorDetails(cause);
      }
      const passed =
        outcome?.status === "complete" &&
        persistedMovements === movements &&
        durationMs < 120_000;
      const rpcSpans = observer.spans.map((span) => ({
        ...span,
        offsetMs: span.startedAtMs - started,
      }));
      writePerformanceReport("banking-import", {
        outcome: passed ? "passed" : "failed",
        criteria: {
          expectedStatus: "complete",
          expectedPersistedMovements: movements,
          transportBudgetMs: 120_000,
        },
        dataset: {
          source: "synthetic in-memory connector (no bank access)",
          accounts: 1,
          movements,
          combinedRecords: movements + 1,
          normalizedBytes,
          pages: 1,
        },
        result: {
          durationMs,
          startedAt,
          endedAt,
          status: outcome?.status ?? null,
          reason: outcome?.reason ?? null,
          error,
          persistedMovements,
          verificationError,
        },
        diagnostics: {
          timeline: timeline(started, durationMs, [
            ...observer.spans.map((span) => ({
              name: `private RPC ${span.procedure}`,
              startedAtMs: span.startedAtMs,
              durationMs: span.durationMs,
            })),
            ...fetchPageSpans,
          ]),
          privateRpcSpans: rpcSpans,
          privateRpcSummary: summarizeRpc(observer.spans),
          resources,
          sql,
        },
      });
      expect(passed, "Near-limit import did not complete; inspect report").toBe(
        true,
      );
    } finally {
      await f.db.close();
    }
  }, 180_000);
});
