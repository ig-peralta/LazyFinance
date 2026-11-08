import { BankingSyncStatusSchema } from "@lazyfinance/contracts";
import type {
  ProviderSyncState,
  ProviderSyncStatusFacts,
} from "@lazyfinance/contracts/internal";
import { describe, expect, it } from "vitest";
import { bankingConnection } from "../../../tests/fixtures/banking/fintoc";
import { bankingSyncStatus } from "./banking-sync-status";

const asOf = new Date("2026-11-08T18:00:00.000Z");
const state = (
  changes: Partial<ProviderSyncState> = {},
): ProviderSyncState => ({
  providerConnectionId: bankingConnection.id,
  checkpoint: null,
  revision: 3,
  lastAttemptAt: "2026-11-08T17:59:00.000Z",
  lastSuccessAt: "2026-11-07T18:00:00.000Z",
  lastProviderObservedAt: "2026-11-07T18:00:00.000Z",
  lastResult: "complete",
  unresolvedConflictCount: 0,
  lastFailureAt: null,
  lastFailureReason: null,
  retryAfter: null,
  leaseExpiresAt: null,
  ...changes,
});
const facts = (): ProviderSyncStatusFacts => ({
  connection: {
    id: bankingConnection.id,
    status: "active",
    disconnectedAt: null,
    disconnectPending: false,
  },
  state: null,
  providerSuspensionCount: 0,
  accounts: [],
});
const account = (
  changes: Partial<ProviderSyncStatusFacts["accounts"][number]> = {},
): ProviderSyncStatusFacts["accounts"][number] => ({
  id: "00000000-0000-4000-8000-000000000082",
  type: "checking",
  hasReportedBalance: true,
  lastSyncedAt: "2026-11-08T17:00:00.000Z",
  historyCompleteness: "partial",
  historyFrom: "2026-08-11",
  historyThrough: "2026-11-08",
  ...changes,
});

describe("bank synchronization and source freshness reporting", () => {
  it("reports a never-imported active connection without manufacturing freshness/success", () => {
    expect(bankingSyncStatus(facts(), asOf)).toMatchObject({
      activity: "idle",
      lastSuccessAt: null,
      canRefresh: true,
      freshness: { state: "unknown", unknownAccounts: 0 },
      accounts: [],
    });
  });

  it.each([
    ["2026-11-08T17:00:00.000Z", true, "fresh"],
    ["2026-11-07T18:00:00.000Z", true, "stale"],
    ["2026-11-07T17:59:59.000Z", true, "stale"],
    [null, true, "unknown"],
    ["2026-11-08T17:00:00.000Z", false, "unknown"],
    ["2026-11-08T18:00:01.000Z", true, "unknown"],
  ] as const)("uses the source date %s and reported-value flag %s, not fetch success", (lastSyncedAt, hasReportedBalance, expected) => {
    const result = bankingSyncStatus(
      {
        ...facts(),
        state: state({ lastSuccessAt: asOf.toISOString() }),
        accounts: [account({ lastSyncedAt, hasReportedBalance })],
      },
      asOf,
    );
    expect(result.freshness.state).toBe(expected);
    expect(result.accounts[0].freshness).toBe(expected);
    expect(BankingSyncStatusSchema.safeParse(result).success).toBe(true);
  });

  it("retains per-account unknown/card states and makes any stale source visible", () => {
    const result = bankingSyncStatus(
      {
        ...facts(),
        state: state(),
        accounts: [
          account(),
          account({
            id: "00000000-0000-4000-8000-000000000083",
            lastSyncedAt: "2026-11-01T18:00:00.000Z",
          }),
          account({
            id: "00000000-0000-4000-8000-000000000084",
            type: "credit_card",
            hasReportedBalance: false,
            lastSyncedAt: null,
          }),
        ],
      },
      asOf,
    );
    expect(result.freshness).toMatchObject({
      state: "stale",
      freshAccounts: 1,
      staleAccounts: 1,
      unknownAccounts: 1,
    });
  });

  it("exposes a live lease and an expired interrupted attempt separately, without a fake success", () => {
    const current = {
      ...facts(),
      state: state({ leaseExpiresAt: "2026-11-08T18:01:00.000Z" }),
    };
    expect(bankingSyncStatus(current, asOf)).toMatchObject({
      activity: "in_progress",
      canRefresh: false,
    });
    const interrupted = bankingSyncStatus(
      current,
      new Date("2026-11-08T18:01:00.000Z"),
    );
    expect(interrupted).toMatchObject({
      activity: "interrupted",
      canRefresh: true,
      lastSuccessAt: "2026-11-07T18:00:00.000Z",
    });
  });

  it("keeps failed-attempt/backoff facts separate from last-good success", () => {
    const result = bankingSyncStatus(
      {
        ...facts(),
        state: state({
          lastFailureAt: "2026-11-08T17:59:30.000Z",
          lastFailureReason: "retryable",
          retryAfter: "2026-11-08T18:02:00.000Z",
        }),
      },
      asOf,
    );
    expect(result).toMatchObject({
      activity: "idle",
      canRefresh: false,
      lastSuccessAt: "2026-11-07T18:00:00.000Z",
      failure: { reason: "retryable", retryAfter: "2026-11-08T18:02:00.000Z" },
    });
  });

  it.each([
    "expired",
    "revoked",
  ] as const)("retains known stored data while %s access requires recovery", (status) => {
    const result = bankingSyncStatus(
      {
        ...facts(),
        connection: { ...facts().connection, status },
        state: state(),
        accounts: [account()],
      },
      asOf,
    );
    expect(result).toMatchObject({
      lifecycle: status,
      canRefresh: false,
      freshness: { state: "fresh" },
    });
    expect(result.lastSuccessAt).not.toBeNull();
  });
});
