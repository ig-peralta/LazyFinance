import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  Injector,
  inject,
  resource,
  signal,
  viewChild,
} from "@angular/core";
import {
  FinancialWriteScopeSchema,
  MCP_PERMISSION_LABELS,
  type McpGrant,
} from "@lazyfinance/contracts";
import {
  initialReadSettled,
  reportWorkspaceReadiness,
} from "../../core/rendering/workspace-preparation";
import { RpcClient, type RpcScope } from "../../core/rpc/rpc-client";
import { createScopedCommand } from "../../core/rpc/scoped-command";
import { McpClientIdentity } from "../../features/mcp-authorization/client-identity";
import { Icon } from "../../shared/ui/icon";

@Component({
  selector: "mcp-grants-page",
  imports: [McpClientIdentity, Icon],
  templateUrl: "./mcp-grants.page.html",
  styleUrl: "./mcp-grants.page.css",
})
export class McpGrantsPage {
  private readonly now = signal(Date.now());
  protected readonly status = (grant: McpGrant) =>
    grant.revokedAt
      ? "Revocado"
      : Date.parse(grant.expiresAt) <= this.now()
        ? "Vencido"
        : "Vigente";
  protected readonly permissionLabel = (scope: string) => {
    const parsed = FinancialWriteScopeSchema.safeParse(scope);
    return parsed.success
      ? MCP_PERMISSION_LABELS[parsed.data]
      : scope === "finance:read"
        ? "Consultar tus finanzas"
        : scope === "offline_access"
          ? "Renovar el acceso dentro de su vigencia"
          : scope === "openid"
            ? "Identificador de cuenta para esta conexión"
            : "Permiso no reconocido";
  };
  protected readonly writes = (grant: McpGrant) =>
    grant.scopes.flatMap((scope) => {
      const value = FinancialWriteScopeSchema.safeParse(scope);
      return value.success ? [MCP_PERMISSION_LABELS[value.data]] : [];
    });
  protected readonly financialPermissions = (grant: McpGrant) =>
    grant.scopes.filter(
      (scope) =>
        scope === "finance:read" ||
        FinancialWriteScopeSchema.safeParse(scope).success,
    );
  private readonly rpc = inject(RpcClient);
  private readonly injector = inject(Injector);
  private readonly cancelButton =
    viewChild<ElementRef<HTMLButtonElement>>("cancelRevoke");
  private readonly heading = viewChild<ElementRef<HTMLElement>>("heading");
  private opener: HTMLElement | null = null;
  protected readonly command = createScopedCommand();
  private readonly readVersion = signal(0);
  private readonly uncertain = signal<{
    scope: RpcScope;
    version: number;
  } | null>(null);
  private readonly selection = signal<{ scope: RpcScope; id: string } | null>(
    null,
  );
  protected readonly selected = computed(() =>
    this.selection()?.scope === this.rpc.authenticatedScope()
      ? this.selection()?.id
      : undefined,
  );
  protected readonly grants = resource({
    params: () => {
      const scope = this.rpc.authenticatedScope();
      return scope ? { scope, version: this.readVersion() } : undefined;
    },
    loader: async ({ params: { scope, version }, abortSignal }) => {
      const grants = await scope.client.mcpAccess.grants.query(undefined, {
        signal: abortSignal,
      });
      const uncertain = this.uncertain();
      if (
        !abortSignal.aborted &&
        scope === this.rpc.authenticatedScope() &&
        uncertain?.scope === scope &&
        version > uncertain.version
      ) {
        this.uncertain.set(null);
        this.command.clear();
      }
      return grants;
    },
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
  protected readonly date = (value: string) =>
    new Intl.DateTimeFormat("es-CL", {
      timeZone: "America/Santiago",
      dateStyle: "medium",
    }).format(new Date(value));

  constructor() {
    const clock = setInterval(() => this.now.set(Date.now()), 30_000);
    inject(DestroyRef).onDestroy(() => clearInterval(clock));
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
    this.now.set(Date.now());
    this.readVersion.update((version) => version + 1);
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
    const confirmed = await this.command.run(
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
      "Acceso retirado. La aplicación ya no puede hacer nuevas consultas.",
    );
    if (
      !confirmed &&
      scope &&
      scope === this.rpc.authenticatedScope() &&
      !scope.signal.aborted
    )
      this.uncertain.set({ scope, version: this.readVersion() });
  }
}
