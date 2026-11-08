import type { RpcOutput } from "./rpc";

export const bankingConfiguration = {
  enabled: true,
  publicKey: "pk_test_ui_fixture",
  mode: "test",
} satisfies RpcOutput<"banking.configuration">;

export const bankingIntent = {
  id: "00000000-0000-4000-8000-000000000091",
  publicKey: "pk_test_ui_fixture",
  widgetToken: "li_ui_sec_fixture",
  mode: "test",
  expiresAt: "2026-11-08T18:00:00.000Z",
} satisfies RpcOutput<"banking.createLinkIntent">;

export const bankingConnection = {
  id: "00000000-0000-4000-8000-000000000092",
  provider: "fintoc",
  mode: "test",
  holderType: "individual",
  institution: { id: "cl_banco_bci", name: "Bci de prueba" },
  status: "active",
  disconnectedAt: null,
  disconnectPending: false,
  createdAt: "2026-11-08T17:00:00.000Z",
  updatedAt: "2026-11-08T17:00:00.000Z",
} satisfies RpcOutput<"banking.connections">[number];

export const bankingSyncStatus = (
  changes: Partial<RpcOutput<"banking.syncStatus">> = {},
): RpcOutput<"banking.syncStatus"> => ({
  connectionId: bankingConnection.id,
  asOf: "2026-11-08T18:00:00.000Z",
  lifecycle: "active",
  disconnectedAt: null,
  disconnectPending: false,
  activity: "idle",
  leaseExpiresAt: null,
  lastAttemptAt: null,
  lastSuccessAt: null,
  lastResult: null,
  unresolvedConflictCount: 0,
  providerSuspensionCount: 0,
  failure: null,
  canRefresh: true,
  freshness: {
    state: "unknown",
    staleAfterSeconds: 86400,
    freshAccounts: 0,
    staleAccounts: 0,
    unknownAccounts: 0,
  },
  accounts: [],
  ...changes,
});

export const bankingImportResult = {
  status: "complete",
  conflictCount: 0,
  report: {
    requestedHistory: { from: "2026-11-08", through: "2026-11-08" },
    importedAccounts: 2,
    bookedMovements: 15,
    reversedMovements: 1,
    ignoredPendingMovements: 2,
    ignoredProcessingMovements: 1,
    uncertainMovements: 15,
    skippedAccounts: [
      { externalId: "acc_unsupported_fixture", reason: "unsupported_currency" },
    ],
    unknownCardBalances: ["acc_card_fixture"],
  },
} satisfies RpcOutput<"banking.importInitial">;
