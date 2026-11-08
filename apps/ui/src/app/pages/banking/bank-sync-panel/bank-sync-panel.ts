import {
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  output,
  resource,
  signal,
} from "@angular/core";
import { RouterLink } from "@angular/router";
import type {
  BankingConnection,
  BankingImportResult,
  BankingSyncStatus,
} from "@lazyfinance/contracts";
import { santiagoDate } from "../../../../utils/date";
import { RpcClient, type RpcScope } from "../../../core/rpc/rpc-client";
import { createScopedCommand } from "../../../core/rpc/scoped-command";
import { accountTypeLabel } from "../../../features/accounts/account-presentation";
import { Icon } from "../../../shared/ui/icon";

const timestamp = new Intl.DateTimeFormat("es-CL", {
  timeZone: "America/Santiago",
  dateStyle: "medium",
  timeStyle: "short",
});

@Component({
  selector: "bank-sync-panel",
  imports: [RouterLink, Icon],
  templateUrl: "./bank-sync-panel.html",
  styleUrl: "./bank-sync-panel.css",
})
export class BankSyncPanel {
  readonly connection = input.required<BankingConnection>();
  readonly enabled = input(false);
  readonly locked = input(false);
  readonly stateRead = output<BankingSyncStatus>();
  readonly pendingChange = output<boolean>();
  readonly closed = output<void>();
  protected readonly trackingDay = computed(() =>
    santiagoDate(new Date(this.connection().createdAt)),
  );
  private readonly rpc = inject(RpcClient);
  private readonly lifetime = inject(DestroyRef);
  private readonly readVersion = signal(0);
  private readonly attempt = signal<{
    scope: RpcScope;
    id: string;
    read: number;
    unconfirmed: boolean;
    result: BankingImportResult | null;
  } | null>(null);
  protected readonly command = createScopedCommand(() => this.connection().id);
  protected readonly status = resource({
    params: () => {
      const scope = this.rpc.authenticatedScope();
      return scope
        ? { scope, id: this.connection().id, read: this.readVersion() }
        : undefined;
    },
    loader: async ({ params, abortSignal }) => {
      const snapshot = await params.scope.client.banking.syncStatus.query(
        { id: params.id },
        { signal: abortSignal },
      );
      if (snapshot.connectionId !== params.id)
        throw new Error("Synchronization status does not match its connection");
      return { ...params, snapshot };
    },
  });
  protected readonly snapshot = computed(() => {
    const read = this.status.hasValue() ? this.status.value() : undefined;
    return read &&
      read.scope === this.rpc.authenticatedScope() &&
      read.id === this.connection().id
      ? read.snapshot
      : undefined;
  });
  private readonly currentAttempt = computed(() => {
    const attempt = this.attempt();
    return attempt &&
      attempt.scope === this.rpc.authenticatedScope() &&
      attempt.id === this.connection().id
      ? attempt
      : undefined;
  });
  protected readonly result = computed(() => this.currentAttempt()?.result);
  protected readonly report = computed(() => {
    const result = this.result();
    return result?.status === "complete" || result?.status === "needs_review"
      ? result.report
      : undefined;
  });
  protected readonly needsReconciliation = computed(() => {
    const attempt = this.currentAttempt();
    return (
      !!attempt?.unconfirmed &&
      (!this.snapshot() ||
        this.status.isLoading() ||
        !this.status.hasValue() ||
        this.status.value().read <= attempt.read)
    );
  });
  protected readonly canSync = computed(
    () =>
      this.enabled() &&
      !this.locked() &&
      !this.command.pending() &&
      !this.status.isLoading() &&
      !this.needsReconciliation() &&
      !!this.snapshot()?.canRefresh,
  );
  protected readonly title = computed(() => {
    const state = this.snapshot();
    if (!state) return "Estado de sincronización";
    if (state.activity === "in_progress") return "Sincronización en curso";
    if (state.activity === "interrupted") return "Intento interrumpido";
    if (state.failure) return "Último intento fallido";
    if (!state.lastSuccessAt) return "Sin importación confirmada";
    return state.lastResult === "needs_review"
      ? "Datos importados con revisiones pendientes"
      : "Última importación completada";
  });
  protected readonly type = accountTypeLabel;
  protected readonly time = (value: string) =>
    timestamp.format(new Date(value));
  protected readonly freshness = (
    state: BankingSyncStatus["freshness"]["state"],
  ) =>
    ({
      fresh: "Saldo reciente a la consulta",
      stale: "Saldo con antigüedad de 24 horas o más",
      unknown: "Antigüedad del saldo desconocida",
    })[state];
  protected readonly failure = (
    reason: NonNullable<BankingSyncStatus["failure"]>["reason"],
  ) =>
    ({
      retryable:
        "Fintoc o el servidor no pudieron completar la lectura. Puedes reintentar cuando el estado lo permita.",
      expired:
        "El acceso venció. Revincula el mismo banco y titular antes de importar de nuevo.",
      revoked:
        "El acceso fue revocado. Revincula la conexión antes de importar de nuevo.",
      invalid_data:
        "Los datos recibidos no pudieron validarse. No se aplicó una importación parcial.",
    })[reason];

  constructor() {
    effect(() => this.pendingChange.emit(this.command.pending()));
    effect(() => {
      const snapshot = this.snapshot();
      if (snapshot) this.stateRead.emit(snapshot);
    });
  }

  protected readStatus() {
    this.readVersion.update((version) => version + 1);
  }

  protected async synchronize() {
    const scope = this.rpc.authenticatedScope(),
      snapshot = this.snapshot();
    if (!scope || !snapshot || !this.canSync()) return;
    const attempt = {
      scope,
      id: this.connection().id,
      read: this.readVersion(),
      unconfirmed: false,
      result: null,
    };
    this.attempt.set(attempt);
    this.pendingChange.emit(true);
    const confirmed = await this.command.run(
      (current, signal) =>
        snapshot.lastSuccessAt
          ? current.client.banking.refresh.mutate(
              { id: attempt.id },
              { signal },
            )
          : current.client.banking.importInitial.mutate(
              { id: attempt.id },
              { signal },
            ),
      (result) => {
        this.attempt.set({ ...attempt, result });
        this.readStatus();
      },
      "",
    );
    if (
      !confirmed &&
      !this.lifetime.destroyed &&
      !scope.signal.aborted &&
      scope === this.rpc.authenticatedScope() &&
      attempt.id === this.connection().id
    )
      this.attempt.set({
        ...attempt,
        read: this.readVersion(),
        unconfirmed: true,
      });
  }
}
