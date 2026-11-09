import {
  afterNextRender,
  Component,
  computed,
  ElementRef,
  Injector,
  inject,
  resource,
  signal,
  viewChild,
} from "@angular/core";
import type { McpGrant } from "@lazyfinance/contracts";
import {
  initialReadSettled,
  reportWorkspaceReadiness,
} from "../../core/rendering/workspace-preparation";
import { RpcClient, type RpcScope } from "../../core/rpc/rpc-client";
import { createScopedCommand } from "../../core/rpc/scoped-command";

@Component({
  selector: "mcp-grants-page",
  templateUrl: "./mcp-grants.page.html",
})
export class McpGrantsPage {
  private readonly rpc = inject(RpcClient);
  private readonly injector = inject(Injector);
  private readonly cancelButton =
    viewChild<ElementRef<HTMLButtonElement>>("cancelRevoke");
  private readonly heading = viewChild<ElementRef<HTMLElement>>("heading");
  private opener: HTMLElement | null = null;
  protected readonly command = createScopedCommand();
  private readonly selection = signal<{ scope: RpcScope; id: string } | null>(
    null,
  );
  protected readonly selected = computed(() =>
    this.selection()?.scope === this.rpc.authenticatedScope()
      ? this.selection()?.id
      : undefined,
  );
  protected readonly grants = resource({
    params: () => this.rpc.authenticatedScope(),
    loader: ({ params: scope, abortSignal }) =>
      scope.client.mcpAccess.grants.query(undefined, { signal: abortSignal }),
    defaultValue: [],
  });
  protected readonly configuration = resource({
    params: () => this.rpc.authenticatedScope(),
    loader: ({ params: scope, abortSignal }) =>
      scope.client.mcpAccess.configuration.query(undefined, {
        signal: abortSignal,
      }),
  });
  protected readonly time = (value: string) =>
    new Intl.DateTimeFormat("es-CL", {
      timeZone: "America/Santiago",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));

  constructor() {
    reportWorkspaceReadiness(
      () =>
        initialReadSettled(this.grants) &&
        initialReadSettled(this.configuration),
    );
  }

  protected select(grant: McpGrant, event: Event) {
    const scope = this.rpc.authenticatedScope();
    if (
      !scope ||
      this.command.pending() ||
      this.grants.isLoading() ||
      this.grants.error() ||
      this.command.error()
    )
      return;
    this.command.clear();
    this.opener =
      event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    this.selection.set({ scope, id: grant.id });
    afterNextRender(
      () => {
        if (scope === this.rpc.authenticatedScope())
          this.cancelButton()?.nativeElement.focus();
      },
      { injector: this.injector },
    );
  }

  protected cancel() {
    if (this.command.pending()) return;
    const current = this.selection()?.scope === this.rpc.authenticatedScope();
    this.selection.set(null);
    if (current && this.opener?.isConnected) this.opener.focus();
    this.opener = null;
  }

  protected reload() {
    if (this.command.pending()) return;
    this.selection.set(null);
    this.command.clear();
    this.grants.reload();
    this.configuration.reload();
  }

  protected async revoke(id: string) {
    if (
      this.command.pending() ||
      this.command.error() ||
      this.selected() !== id
    )
      return;
    const scope = this.rpc.authenticatedScope();
    await this.command.run(
      (scope, signal) =>
        scope.client.mcpAccess.revoke.mutate({ id }, { signal }),
      () => {
        this.selection.set(null);
        this.opener = null;
        this.grants.reload();
        afterNextRender(
          () => {
            if (scope === this.rpc.authenticatedScope())
              this.heading()?.nativeElement.focus();
          },
          { injector: this.injector },
        );
      },
      "Acceso revocado. Las próximas consultas de esta conexión serán rechazadas.",
    );
  }
}
