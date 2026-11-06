import type { Generated } from "kysely";

export interface ProviderSyncStateTable {
  providerConnectionId: string;
  checkpoint: string | null;
  revision: Generated<number>;
  lastAttemptAt: Date | null;
  lastSuccessAt: Date | null;
  lastProviderObservedAt: Date | null;
  lastResult: "complete" | "needs_review" | null;
  unresolvedConflictCount: Generated<number>;
  lastFailureAt: Date | null;
  lastFailureReason:
    | "retryable"
    | "expired"
    | "revoked"
    | "invalid_data"
    | null;
  retryAfter: Date | null;
}

export type ProviderSyncStateTables = {
  "finance.provider_sync_state": ProviderSyncStateTable;
};
