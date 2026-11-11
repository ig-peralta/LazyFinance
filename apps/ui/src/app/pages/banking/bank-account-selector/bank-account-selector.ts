import {
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  resource,
  signal,
} from "@angular/core";
import type { BankingSelection } from "@lazyfinance/contracts";
import { RpcClient, type RpcScope } from "../../../core/rpc/rpc-client";
import { createScopedCommand } from "../../../core/rpc/scoped-command";

@Component({
  selector: "bank-account-selector",
  templateUrl: "./bank-account-selector.html",
  styleUrl: "./bank-account-selector.css",
})
export class BankAccountSelector {
  readonly connectionId = input.required<string>();
  readonly enabled = input(false);
  readonly locked = input(false);
  readonly automaticEnabled = input(false);
  readonly confirmed = output<BankingSelection>();
  readonly pendingChange = output<boolean>();
  readonly reconciliationChange = output<boolean>();
  private readonly rpc = inject(RpcClient);
  private readonly read = signal(0);
  protected readonly command = createScopedCommand(() => this.connectionId());
  private readonly draft = signal<{
    scope: RpcScope;
    id: string;
    version: number;
    discovery: number;
    ids: string[];
    automatic: boolean;
  } | null>(null);
  private readonly uncertain = signal<{
    scope: RpcScope;
    id: string;
    read: number;
  } | null>(null);
  protected readonly selection = resource({
    params: () => {
      const scope = this.rpc.authenticatedScope();
      return scope
        ? { scope, id: this.connectionId(), read: this.read() }
        : undefined;
    },
    loader: async ({ params, abortSignal }) => {
      const value = await params.scope.client.banking.accountSelection.query(
        { id: params.id },
        { signal: abortSignal },
      );
      if (value.connectionId !== params.id)
        throw new Error("Selection does not match its connection");
      return { ...params, value };
    },
  });
  protected readonly snapshot = computed(() => {
    const loaded = this.selection.hasValue()
      ? this.selection.value()
      : undefined;
    return loaded?.scope === this.rpc.authenticatedScope() &&
      loaded?.id === this.connectionId() &&
      loaded.value.connectionId === loaded.id
      ? loaded.value
      : undefined;
  });
  private readonly currentDraft = computed(() => {
    const draft = this.draft(),
      snapshot = this.snapshot();
    return draft?.scope === this.rpc.authenticatedScope() &&
      draft?.id === this.connectionId() &&
      draft.version === snapshot?.version &&
      draft.discovery === snapshot.discoveryVersion
      ? draft
      : undefined;
  });
  protected readonly selectedIds = computed(
    () => this.currentDraft()?.ids ?? this.snapshot()?.accountIds ?? [],
  );
  protected readonly missingIds = computed(() => {
    const snapshot = this.snapshot();
    const available = new Set(
      snapshot?.accounts.map((account) => account.externalId),
    );
    return snapshot?.accountIds.filter((id) => !available.has(id)) ?? [];
  });
  protected readonly automatic = computed(
    () =>
      this.currentDraft()?.automatic ??
      this.snapshot()?.automaticEnrolled ??
      false,
  );
  protected readonly needsReconciliation = computed(() => {
    const uncertain = this.uncertain();
    return (
      uncertain?.scope === this.rpc.authenticatedScope() &&
      uncertain?.id === this.connectionId() &&
      (this.selection.isLoading() ||
        !this.selection.hasValue() ||
        this.selection.value().read <= uncertain.read)
    );
  });
  protected readonly canWrite = computed(
    () =>
      this.enabled() &&
      !this.locked() &&
      !this.command.pending() &&
      !this.selection.isLoading() &&
      !!this.snapshot() &&
      !this.needsReconciliation(),
  );
  protected readonly readDeferred = computed(() => {
    const retryAt = this.snapshot()?.readRetryAfter;
    return !!retryAt && Date.parse(retryAt) > Date.now();
  });

  constructor() {
    effect(() => this.pendingChange.emit(this.command.pending()));
    effect(() => this.reconciliationChange.emit(this.needsReconciliation()));
  }

  protected reload() {
    this.command.clear();
    this.draft.set(null);
    this.read.update((value) => value + 1);
  }

  protected toggle(id: string, checked: boolean) {
    if (
      !this.canWrite() ||
      (checked &&
        this.snapshot()?.accounts.find((account) => account.externalId === id)
          ?.unavailableReason)
    )
      return;
    this.edit(
      checked
        ? [...this.selectedIds(), id]
        : this.selectedIds().filter((value) => value !== id),
      this.automatic(),
    );
  }

  protected setAutomatic(checked: boolean) {
    if (this.canWrite()) this.edit([...this.selectedIds()], checked);
  }

  private edit(ids: string[], automatic: boolean) {
    const scope = this.rpc.authenticatedScope(),
      value = this.snapshot();
    if (scope && value)
      this.draft.set({
        scope,
        id: this.connectionId(),
        version: value.version,
        discovery: value.discoveryVersion,
        ids,
        automatic,
      });
  }

  protected async discover() {
    if (!this.canWrite() || this.readDeferred()) return;
    await this.write(false);
  }

  protected async save() {
    if (!this.canWrite() || !this.snapshot()?.discoveryVersion) return;
    await this.write(true);
  }

  private async write(save: boolean) {
    const scope = this.rpc.authenticatedScope(),
      value = this.snapshot(),
      id = this.connectionId();
    if (!scope || !value) return;
    const confirmed = await this.command.run(
      (current, signal) =>
        save
          ? current.client.banking.selectAccounts.mutate(
              {
                id,
                expectedVersion: value.version,
                discoveryVersion: value.discoveryVersion,
                accountIds: [...this.selectedIds()],
                automaticEnrolled: this.automatic(),
              },
              { signal },
            )
          : current.client.banking.discoverAccounts.mutate({ id }, { signal }),
      (result) => {
        this.selection.set({ scope, id, read: this.read(), value: result });
        this.draft.set(null);
        this.uncertain.set(null);
        if (save) this.confirmed.emit(result);
      },
      save ? "Selección guardada." : "Cuentas disponibles consultadas.",
    );
    if (
      !confirmed &&
      scope === this.rpc.authenticatedScope() &&
      !scope.signal.aborted &&
      id === this.connectionId()
    )
      this.uncertain.set({ scope, id, read: this.read() });
  }
}
