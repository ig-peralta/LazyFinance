import { describe, expect, it, vi } from "vitest";
import type { PersistenceClient } from "../persistence/persistence.client";
import { AccountsService } from "./accounts.service";

describe("financial coverage", () => {
  it("distinguishes general history completeness from coverage of the requested month", async () => {
    const id = "00000000-0000-4000-8000-000000000011";
    const listActive = vi.fn(async () => [
      {
        id,
        type: "checking" as const,
        balance: "100.00",
        currency: "CLP" as const,
        alias: null,
        trackingStatus: "tracked" as const,
        lastSyncedAt: "2026-11-20T12:00:00.000Z",
      },
    ]);
    const coverage = vi.fn(async () => [
      {
        id,
        historyCompleteness: "complete" as const,
        historyFrom: "2026-10-01",
        historyThrough: "2026-11-22",
      },
    ]);
    const aggregates = vi.fn(
      async (_period: {
        start: string;
        end: string;
        asOf: string;
        adjustmentsAsOf: string;
      }) => [],
    );
    const persistence = {
      user: vi.fn(() => ({
        accounts: {
          listActive: { query: listActive },
          coverage: { query: coverage },
        },
        transactions: { aggregates: { query: aggregates } },
      })),
    };
    const service = new AccountsService(
      persistence as unknown as PersistenceClient,
    );

    const october = await service.coverageForUser("owner", "2026-10");
    expect(october.accounts[0]).toMatchObject({
      historyCompleteness: "complete",
      monthCovered: true,
    });
    const september = await service.coverageForUser("owner", "2026-09");
    expect(september.accounts[0]).toMatchObject({
      historyCompleteness: "complete",
      monthCovered: false,
    });
    expect(aggregates).toHaveBeenCalledWith(
      expect.objectContaining({
        start: "2026-09-01 00:00:00",
        end: "2026-10-01 00:00:00",
      }),
    );
  });
});
