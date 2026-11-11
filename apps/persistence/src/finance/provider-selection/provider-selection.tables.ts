import type {
  BankingAccountChoice,
  BankingAutomation,
} from "@lazyfinance/contracts";
import type { ColumnType, Generated } from "kysely";

export interface ProviderSelectionTable {
  connectionId: string;
  userId: string;
  version: Generated<number>;
  discoveryVersion: Generated<number>;
  credentialVersion: number | null;
  discoveredAt: Date | null;
  readRetryAfter: Date | null;
  accounts: ColumnType<BankingAccountChoice[], string, string>;
  accountIds: Generated<string[]>;
  confirmedAt: Date | null;
  automaticEnrolled: Generated<boolean>;
}

export interface ProviderScheduleTable {
  connectionId: string;
  userId: string;
  mode: "test" | "live";
  credentialVersion: number;
  selectionVersion: number;
  eligible: Generated<boolean>;
  nextAttemptAt: Date | null;
  failureCount: Generated<number>;
  pauseReason: BankingAutomation["pauseReason"];
  claimId: string | null;
  claimExpiresAt: Date | null;
  runRevision: number | null;
  attempts: Generated<Date[]>;
}

export interface ProviderRequestAdmissionTable {
  id: string;
  mode: "test" | "live";
  purpose: "sync" | "lifecycle";
  startedAt: Generated<Date>;
  expiresAt: Generated<Date>;
  finishedAt: Date | null;
}

export type ProviderAutomationTables = {
  "finance.provider_account_selection": ProviderSelectionTable;
  "finance.provider_sync_schedule": ProviderScheduleTable;
  "finance.provider_request_admission": ProviderRequestAdmissionTable;
  "finance.provider_request_backoff": {
    mode: "test" | "live";
    retryAfter: Date;
  };
};
