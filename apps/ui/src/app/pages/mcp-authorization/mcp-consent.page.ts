import {
  Component,
  computed,
  DestroyRef,
  inject,
  resource,
  signal,
} from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { ActivatedRoute, RouterLink } from "@angular/router";
import {
  FinancialWriteScopeSchema,
  MCP_PERMISSION_LABELS,
} from "@lazyfinance/contracts";
import {
  AuthCredentials,
  type VerifiedCredentials,
} from "../../core/auth/auth-credentials";
import {
  initialReadSettled,
  reportWorkspaceReadiness,
} from "../../core/rendering/workspace-preparation";
import { createScopedCommand } from "../../core/rpc/scoped-command";
import { McpClientIdentity } from "../../features/mcp-authorization/client-identity";
import {
  MCP_AUTH_NAVIGATE,
  OAuthInteractionClient,
} from "../../features/mcp-authorization/oauth-interaction.client";

@Component({
  selector: "mcp-consent-page",
  imports: [RouterLink, McpClientIdentity],
  templateUrl: "./mcp-consent.page.html",
})
export class McpConsentPage {
  private readonly now = signal(Date.now());
  protected readonly expired = computed(() => {
    const request = this.consent();
    return !!request && Date.parse(request.expiresAt) <= this.now();
  });
  protected readonly time = (value: string) =>
    new Intl.DateTimeFormat("es-CL", {
      timeZone: "America/Santiago",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  protected readonly credentials = inject(AuthCredentials);
  private readonly interaction = inject(OAuthInteractionClient);
  private readonly navigate = inject(MCP_AUTH_NAVIGATE);
  private readonly query = toSignal(inject(ActivatedRoute).queryParamMap);
  protected readonly id = computed(() => {
    const value = this.query()?.get("interaction");
    return value && /^[A-Za-z0-9_-]{1,256}$/.test(value) ? value : undefined;
  });
  protected readonly command = createScopedCommand(() => this.id());
  private readonly writeSelection = signal<{
    owner: VerifiedCredentials;
    id: string;
    scopes: string[];
  } | null>(null);
  protected readonly requestedWrites = computed(
    () =>
      this.consent()?.scopes.filter(
        (scope) => FinancialWriteScopeSchema.safeParse(scope).success,
      ) ?? [],
  );
  protected readonly selectedWrites = computed(() =>
    this.writeSelection()?.owner === this.credentials.current() &&
    this.writeSelection()?.id === this.id()
      ? (this.writeSelection()?.scopes ?? [])
      : [],
  );
  protected readonly permissionLabel = (scope: string) => {
    const value = FinancialWriteScopeSchema.safeParse(scope);
    return value.success ? MCP_PERMISSION_LABELS[value.data] : scope;
  };
  private readonly uncertain = signal<{
    owner: VerifiedCredentials;
    id: string;
  } | null>(null);
  protected readonly needsReconciliation = computed(
    () =>
      this.uncertain()?.owner === this.credentials.current() &&
      this.uncertain()?.id === this.id(),
  );
  protected readonly preview = resource({
    params: () => {
      const owner = this.credentials.current(),
        id = this.id();
      return owner && id ? { owner, id } : undefined;
    },
    loader: async ({ params, abortSignal }) => ({
      ...params,
      consent: await this.interaction.preview(
        params.owner,
        params.id,
        abortSignal,
      ),
    }),
  });
  protected readonly consent = computed(() => {
    const value = this.preview.hasValue() ? this.preview.value() : undefined;
    return value &&
      value.owner === this.credentials.current() &&
      value?.id === this.id()
      ? value.consent
      : undefined;
  });
  protected readonly callbackHost = computed(() => {
    const consent = this.consent();
    return consent ? new URL(consent.redirectUri).host : "";
  });
  protected readonly localCallback = computed(() =>
    this.consent()?.redirectUri.startsWith("http:"),
  );
  protected readonly canDecide = computed(
    () =>
      !!this.consent() &&
      !this.expired() &&
      !this.preview.isLoading() &&
      !this.preview.error() &&
      !this.command.pending() &&
      !this.needsReconciliation(),
  );

  constructor() {
    const clock = setInterval(() => this.now.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(clock));
    reportWorkspaceReadiness(
      () => !this.id() || initialReadSettled(this.preview),
    );
  }

  protected async decide(approve: boolean) {
    const owner = this.credentials.current(),
      id = this.id();
    if (!owner || !id || !this.canDecide()) return;
    const confirmed = await this.command.run(
      (_scope, signal) =>
        this.interaction.decide(
          owner,
          id,
          approve,
          signal,
          approve ? this.selectedWrites() : [],
        ),
      (result) => this.navigate(result.redirectTo),
      "Autorización confirmada.",
    );
    if (
      !confirmed &&
      !owner.signal.aborted &&
      this.credentials.current() === owner &&
      this.id() === id
    )
      this.uncertain.set({ owner, id });
  }

  protected toggleWrite(scope: string) {
    const owner = this.credentials.current(),
      id = this.id();
    if (
      !owner ||
      !id ||
      !this.canDecide() ||
      !this.requestedWrites().includes(scope)
    )
      return;
    this.writeSelection.set({
      owner,
      id,
      scopes: this.selectedWrites().includes(scope)
        ? this.selectedWrites().filter((value) => value !== scope)
        : [...this.selectedWrites(), scope],
    });
  }
}
