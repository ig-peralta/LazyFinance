import {
  afterNextRender,
  Component,
  computed,
  ElementRef,
  Injector,
  inject,
  signal,
  viewChild,
} from "@angular/core";
import { RouterLink } from "@angular/router";
import type { BankingConnection } from "@lazyfinance/contracts";
import { reportWorkspaceReadiness } from "../../core/rendering/workspace-preparation";
import { RpcClient, type RpcScope } from "../../core/rpc/rpc-client";
import { createScopedCommand } from "../../core/rpc/scoped-command";
import { BankingData } from "../../features/banking/banking.data";
import { Icon } from "../../shared/ui/icon";
import { BankLinkFlow } from "./bank-link-flow/bank-link-flow";

interface LinkFlow {
  scope: RpcScope;
  mode: "test" | "live";
  connection: BankingConnection | null;
}

@Component({
  selector: "bank-connections-page",
  imports: [RouterLink, Icon, BankLinkFlow],
  providers: [BankingData],
  templateUrl: "./bank-connections.page.html",
  styleUrl: "./bank-connections.page.css",
  host: { "(keydown.escape)": "cancelConfirmation()" },
})
export class BankConnectionsPage {
  protected readonly data = inject(BankingData);
  private readonly rpc = inject(RpcClient);
  private readonly injector = inject(Injector);
  protected readonly command = createScopedCommand();
  private readonly flow = signal<LinkFlow | null>(null);
  private readonly noticeState = signal<{
    scope: RpcScope;
    message: string;
  } | null>(null);
  private readonly confirmation = signal<{
    scope: RpcScope;
    id: string;
  } | null>(null);
  private readonly cancelButton =
    viewChild<ElementRef<HTMLButtonElement>>("cancelDisconnect");
  private readonly heading = viewChild<ElementRef<HTMLElement>>("heading");
  private opener: HTMLElement | null = null;

  protected readonly configuration = computed(() => {
    const resource = this.data.configuration;
    const value = resource.hasValue() ? resource.value() : undefined;
    return value?.enabled ? value : undefined;
  });
  protected readonly activeFlow = computed(() =>
    this.flow()?.scope === this.rpc.authenticatedScope() ? this.flow() : null,
  );
  protected readonly notice = computed(() =>
    this.noticeState()?.scope === this.rpc.authenticatedScope()
      ? this.noticeState()?.message
      : null,
  );
  protected readonly confirming = computed(() => {
    const confirmation = this.confirmation();
    return confirmation &&
      confirmation.scope === this.rpc.authenticatedScope() &&
      this.data.connections.hasValue()
      ? this.data.connections
          .value()
          .find((bank) => bank.id === confirmation.id)
      : undefined;
  });
  protected readonly busy = computed(
    () => this.command.pending() || !!this.activeFlow(),
  );

  constructor() {
    reportWorkspaceReadiness(this.data.configuration, this.data.connections);
  }

  protected connect(connection: BankingConnection | null = null) {
    const scope = this.rpc.authenticatedScope(),
      configuration = this.configuration();
    if (
      !scope ||
      !configuration ||
      this.busy() ||
      this.data.configuration.isLoading() ||
      this.data.connections.isLoading() ||
      this.data.connections.error()
    )
      return;
    this.command.clear();
    this.noticeState.set(null);
    this.confirmation.set(null);
    this.flow.set({ scope, mode: configuration.mode, connection });
  }

  protected closeFlow() {
    this.flow.set(null);
    this.data.connections.reload();
    this.focusHeading();
  }

  protected linked(connection: BankingConnection, flow: LinkFlow) {
    if (flow !== this.activeFlow() || flow.scope.signal.aborted) return;
    this.flow.set(null);
    this.noticeState.set({
      scope: flow.scope,
      message: `Autorización de ${connection.institution.name} guardada. La importación de saldos y movimientos todavía no está disponible.`,
    });
    this.data.connections.reload();
    this.focusHeading();
  }

  protected async check(bank: BankingConnection) {
    if (this.busy() || !this.compatible(bank)) return;
    const scope = this.rpc.authenticatedScope();
    this.noticeState.set(null);
    this.confirmation.set(null);
    await this.command.run(
      (current, signal) =>
        current.client.banking.checkConnection.mutate(
          { id: bank.id },
          { signal },
        ),
      () => {},
      "Consulta de acceso terminada. No se actualizaron saldos ni movimientos.",
    );
    if (
      scope &&
      !scope.signal.aborted &&
      scope === this.rpc.authenticatedScope()
    )
      this.data.connections.reload();
  }

  protected confirmDisconnect(bank: BankingConnection, event: Event) {
    const scope = this.rpc.authenticatedScope();
    if (!scope || this.busy()) return;
    this.command.clear();
    this.noticeState.set(null);
    this.opener =
      event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    this.confirmation.set({ scope, id: bank.id });
    afterNextRender(() => this.cancelButton()?.nativeElement.focus(), {
      injector: this.injector,
    });
  }

  protected cancelConfirmation() {
    if (this.command.pending()) return;
    this.confirmation.set(null);
    if (this.opener?.isConnected) this.opener.focus();
    this.opener = null;
  }

  protected async disconnect(bank: BankingConnection) {
    const scope = this.rpc.authenticatedScope();
    this.noticeState.set(null);
    await this.command.run(
      (current, signal) =>
        current.client.banking.disconnect.mutate({ id: bank.id }, { signal }),
      () => {
        this.confirmation.set(null);
        this.opener = null;
        this.focusHeading();
      },
      "Conexión desconectada. El historial financiero guardado se conserva.",
    );
    // A failed response may still have disabled access locally. Reconcile facts,
    // never replay the disconnect automatically or claim the write rolled back.
    if (
      scope &&
      !scope.signal.aborted &&
      scope === this.rpc.authenticatedScope()
    )
      this.data.connections.reload();
  }

  protected compatible(bank: BankingConnection) {
    return (
      !this.data.configuration.isLoading() &&
      this.configuration()?.mode === bank.mode
    );
  }

  private focusHeading() {
    const scope = this.rpc.authenticatedScope();
    afterNextRender(
      () => {
        if (scope && !scope.signal.aborted)
          this.heading()?.nativeElement.focus();
      },
      { injector: this.injector },
    );
  }

  protected state(bank: BankingConnection) {
    if (bank.disconnectedAt)
      return bank.disconnectPending ? "Desconexión pendiente" : "Desconectada";
    return {
      active: "Acceso disponible",
      expired: "Requiere reconexión",
      revoked: "Acceso revocado",
    }[bank.status];
  }
}
