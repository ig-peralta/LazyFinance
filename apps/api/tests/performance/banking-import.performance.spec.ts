import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import type { ConnectorPage } from "../../src/banking/connector/normalized-banking.schema";
import { BankingIngestionService } from "../../src/banking/ingestion/banking-ingestion.service";
import { fixture, integration } from "../fixtures/persistence";
import { writePerformanceReport } from "./report";

const movements = 49_999;

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
      const started = performance.now();
      let outcome: { status: string; reason?: string } | null = null;
      let errorKind: string | null = null;
      try {
        outcome = await new BankingIngestionService(f.persistence).syncForUser(
          f.userId,
          f.connectionId,
          { provider: "fixture-bank", fetchPage: async () => page },
        );
      } catch (error) {
        errorKind = error instanceof Error ? error.name : "unknown";
      }
      const durationMs = performance.now() - started;
      const stored = await f.db.pool.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM finance.transaction t
         JOIN finance.account a ON a.id = t.account_id
         WHERE a.provider_connection_id = $1`,
        [f.connectionId],
      );
      const persistedMovements = Number(stored.rows[0].count);
      const passed =
        outcome?.status === "complete" &&
        persistedMovements === movements &&
        durationMs < 120_000;
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
          status: outcome?.status ?? null,
          reason: outcome?.reason ?? null,
          errorKind,
          persistedMovements,
        },
      });
      expect(passed, "Near-limit import did not complete; inspect report").toBe(
        true,
      );
    } finally {
      await f.db.close();
    }
  });
});
