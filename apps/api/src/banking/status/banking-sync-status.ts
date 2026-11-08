import type { BankingSyncStatus } from "@lazyfinance/contracts";
import type { ProviderSyncStatusFacts } from "@lazyfinance/contracts/internal";

const STALE_AFTER_SECONDS = 24 * 60 * 60;

/** Fetch success, bank-source age and access are deliberately independent. */
export function bankingSyncStatus(
  facts: ProviderSyncStatusFacts,
  asOf: Date,
): BankingSyncStatus {
  const { connection, state } = facts;
  const now = asOf.getTime();
  const running = Boolean(
    state?.leaseExpiresAt && Date.parse(state.leaseExpiresAt) > now,
  );
  const deferred = Boolean(
    state?.retryAfter && Date.parse(state.retryAfter) > now,
  );
  const accounts = facts.accounts.map<BankingSyncStatus["accounts"][number]>(
    (account) => {
      const source = account.lastSyncedAt
        ? Date.parse(account.lastSyncedAt)
        : NaN;
      const age = now - source;
      const freshness =
        !account.hasReportedBalance || !Number.isFinite(source) || age < 0
          ? "unknown"
          : age >= STALE_AFTER_SECONDS * 1000
            ? "stale"
            : "fresh";
      return {
        id: account.id,
        type: account.type,
        freshness,
        balanceAsOf: account.lastSyncedAt,
        historyCoverage: {
          completeness: account.historyCompleteness,
          from: account.historyFrom,
          through: account.historyThrough,
        },
      };
    },
  );
  const counts = { fresh: 0, stale: 0, unknown: 0 };
  for (const account of accounts) counts[account.freshness]++;
  return {
    connectionId: connection.id,
    asOf: asOf.toISOString(),
    lifecycle: connection.status,
    disconnectedAt: connection.disconnectedAt,
    disconnectPending: connection.disconnectPending,
    activity: running
      ? "in_progress"
      : state?.leaseExpiresAt
        ? "interrupted"
        : "idle",
    leaseExpiresAt: state?.leaseExpiresAt ?? null,
    lastAttemptAt: state?.lastAttemptAt ?? null,
    lastSuccessAt: state?.lastSuccessAt ?? null,
    lastResult: state?.lastResult ?? null,
    unresolvedConflictCount: state?.unresolvedConflictCount ?? 0,
    providerSuspensionCount: facts.providerSuspensionCount,
    failure:
      state?.lastFailureAt && state.lastFailureReason
        ? {
            at: state.lastFailureAt,
            reason: state.lastFailureReason,
            retryAfter: state.retryAfter,
          }
        : null,
    canRefresh:
      connection.status === "active" &&
      !connection.disconnectedAt &&
      !running &&
      !deferred,
    freshness: {
      state: counts.stale
        ? "stale"
        : counts.unknown || !accounts.length
          ? "unknown"
          : "fresh",
      staleAfterSeconds: STALE_AFTER_SECONDS,
      freshAccounts: counts.fresh,
      staleAccounts: counts.stale,
      unknownAccounts: counts.unknown,
    },
    accounts,
  };
}
