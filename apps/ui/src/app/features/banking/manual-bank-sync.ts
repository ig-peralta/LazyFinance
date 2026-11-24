import { computed, Injectable, inject, signal } from "@angular/core";
import type {
  BankingImportResult,
  BankingSyncStatus,
} from "@lazyfinance/contracts";
import { SessionService } from "../../core/auth/session.service";
import { RpcClient, type RpcScope } from "../../core/rpc/rpc-client";
import { createScopedCommand } from "../../core/rpc/scoped-command";

export type BankSyncResult =
  | BankingImportResult
  | {
      status:
        | "complete"
        | "needs_review"
        | "access"
        | "disconnected"
        | "selection"
        | "configuration"
        | "deferred"
        | "status_unavailable"
        | "unconfirmed";
    };

export interface BankSyncEntry {
  connectionId: string;
  name: string;
  result: BankSyncResult;
}

/** Only explicit clicks start imports. Views keep ownership of their stored reads. */
@Injectable({ providedIn: "root" })
export class ManualBankSync {
  private readonly rpc = inject(RpcClient);
  private readonly session = inject(SessionService);
  private readonly batch = createScopedCommand();
  private readonly single = signal<{ scope: RpcScope } | undefined>(undefined);
  private readonly completed = signal<
    | {
        scope: RpcScope;
        results: BankSyncEntry[];
        accountId?: string;
      }
    | undefined
  >(undefined);
  private readonly saved = signal<
    { scope: RpcScope; version: number } | undefined
  >(undefined);

  readonly running = this.batch.pending;
  readonly error = computed(() => !!this.batch.error());
  readonly busy = computed(
    () =>
      this.running() ||
      (!!this.single() &&
        this.single()?.scope === this.rpc.authenticatedScope()),
  );
  readonly report = computed(() => {
    const completed = this.completed();
    return completed?.scope === this.rpc.authenticatedScope()
      ? completed
      : undefined;
  });
  readonly revision = computed(() => {
    const saved = this.saved();
    return saved && saved.scope === this.rpc.authenticatedScope()
      ? saved.version
      : 0;
  });

  async start(accountId?: string) {
    if (!this.rpc.authenticatedScope() || this.busy()) return;
    this.completed.set(undefined);
    await this.batch.run(
      async (scope, signal) => ({
        scope,
        accountId,
        results: await this.syncBanks(scope, signal, accountId),
      }),
      (report) => this.completed.set(report),
      "",
    );
  }

  dismiss() {
    this.completed.set(undefined);
    this.batch.clear();
  }

  /** The connection panel retains its own status, cancellation and reply details. */
  async syncConnection(
    scope: RpcScope,
    state: BankingSyncStatus,
    signal: AbortSignal,
  ) {
    if (
      this.busy() ||
      !state.canRefresh ||
      state.lifecycle !== "active" ||
      state.disconnectedAt ||
      state.disconnectPending ||
      !this.current(scope, signal)
    )
      return null;
    const single = { scope };
    this.single.set(single);
    try {
      return await this.importAvailable(scope, state, signal);
    } finally {
      if (this.single() === single) this.single.set(undefined);
    }
  }

  private async syncBanks(
    scope: RpcScope,
    signal: AbortSignal,
    accountId?: string,
  ): Promise<BankSyncEntry[]> {
    const { banking } = scope.client;
    const options = { signal };
    const banks = await banking.connections.query(undefined, options);
    // Demo must not depend on Fintoc configuration being readable or enabled.
    const config = banks.some((bank) => bank.provider === "fintoc")
      ? await banking.configuration.query(undefined, options).catch(() => null)
      : null;
    const results: BankSyncEntry[] = [];

    for (const bank of banks) {
      if (!this.current(scope, signal)) break;
      const eligible =
        bank.provider === "mock_bank"
          ? this.session.demoToolsEnabled()
          : !!config?.enabled && config.mode === bank.mode;
      const accessIssue =
        bank.disconnectedAt || bank.disconnectPending
          ? "disconnected"
          : bank.status !== "active"
            ? "access"
            : !eligible
              ? "configuration"
              : null;

      const entry = { connectionId: bank.id, name: bank.institution.name };
      if (accessIssue && !accountId) {
        results.push({ ...entry, result: { status: accessIssue } });
        continue;
      }
      const state = await this.readStatus(scope, bank.id, signal);
      if (!this.current(scope, signal)) break;
      if (
        accountId &&
        !state?.accounts.some((account) => account.id === accountId)
      )
        continue;

      const result: BankSyncResult = accessIssue
        ? { status: accessIssue }
        : state
          ? await this.attempt(scope, state, signal)
          : { status: "status_unavailable" };
      results.push({ ...entry, result });
      // A movement detail refresh never starts an import for another bank.
      if (accountId) break;
    }
    return results;
  }

  private async attempt(
    scope: RpcScope,
    state: BankingSyncStatus,
    signal: AbortSignal,
  ): Promise<BankSyncResult> {
    if (state.disconnectedAt || state.disconnectPending)
      return { status: "disconnected" };
    if (state.lifecycle !== "active") return { status: "access" };
    if (state.activity === "in_progress" && state.leaseExpiresAt)
      return { status: "in_progress", until: state.leaseExpiresAt };
    if (!state.canRefresh) {
      const retryAfter = state.failure?.retryAfter;
      if (retryAfter && Date.parse(retryAfter) > Date.parse(state.asOf))
        return { status: "retry_later", retryAfter };
      const reason = state.automation.pauseReason;
      return {
        status:
          reason === "selection_required" || reason === "no_accounts"
            ? "selection"
            : "deferred",
      };
    }

    try {
      const result = await this.importAvailable(scope, state, signal);
      return result.status === "complete" || result.status === "needs_review"
        ? { status: result.status }
        : result;
    } catch {
      // A transport error can arrive after commit. Read once, never replay.
      if (this.current(scope, signal)) {
        const latest = await this.readStatus(scope, state.connectionId, signal);
        if (
          this.current(scope, signal) &&
          latest?.lastSuccessAt &&
          latest.lastResult &&
          (!state.lastSuccessAt ||
            Date.parse(latest.lastSuccessAt) > Date.parse(state.lastSuccessAt))
        ) {
          this.confirm(scope);
          return { status: latest.lastResult };
        }
      }
      return { status: "unconfirmed" };
    }
  }

  private async readStatus(scope: RpcScope, id: string, signal: AbortSignal) {
    try {
      const state = await scope.client.banking.syncStatus.query(
        { id },
        { signal },
      );
      if (state.connectionId === id) return state;
    } catch {
      // An unavailable read is not a failed import or revoked access.
    }
    return undefined;
  }

  private async importAvailable(
    scope: RpcScope,
    state: BankingSyncStatus,
    signal: AbortSignal,
  ) {
    const { refresh, importInitial } = scope.client.banking;
    const result = await (state.lastSuccessAt ? refresh : importInitial).mutate(
      { id: state.connectionId },
      { signal },
    );
    if (
      this.current(scope, signal) &&
      (result.status === "complete" || result.status === "needs_review")
    )
      this.confirm(scope);
    return result;
  }

  private confirm(scope: RpcScope) {
    this.saved.set({ scope, version: this.revision() + 1 });
  }

  private current(scope: RpcScope, signal: AbortSignal) {
    return (
      !signal.aborted &&
      !scope.signal.aborted &&
      scope === this.rpc.authenticatedScope()
    );
  }
}
