import {
  computed,
  DestroyRef,
  Injectable,
  inject,
  resource,
  signal,
} from "@angular/core";
import type { AssistantConsentDecision } from "@lazyfinance/contracts";
import { RpcClient, type RpcScope } from "../../core/rpc/rpc-client";
import { createScopedCommand } from "../../core/rpc/scoped-command";

/** Component-owned account preference. Never stores a decision in the browser. */
@Injectable()
export class AssistantConsentData {
  private readonly rpc = inject(RpcClient);
  private readonly lifetime = inject(DestroyRef);
  private readonly readVersion = signal(0);
  private readonly uncertain = signal<{ scope: RpcScope; read: number } | null>(
    null,
  );
  private readonly snapshot = resource({
    params: () => {
      const scope = this.rpc.authenticatedScope();
      return scope ? { scope, read: this.readVersion() } : undefined;
    },
    loader: async ({ params, abortSignal }) => ({
      ...params,
      state: await params.scope.client.assistant.consent.query(undefined, {
        signal: abortSignal,
      }),
    }),
  });
  private readonly current = computed(() => {
    const value = this.snapshot.hasValue() ? this.snapshot.value() : undefined;
    return value?.scope === this.rpc.authenticatedScope() ? value : undefined;
  });
  readonly state = computed(() => this.current()?.state);
  readonly loading = this.snapshot.isLoading;
  readonly readError = computed(() => !!this.snapshot.error());
  private readonly command = createScopedCommand(
    () => this.state()?.policy.key,
  );
  readonly pending = this.command.pending;
  readonly saveError = computed(() => !!this.command.error());
  readonly needsCheck = computed(() => {
    const failure = this.uncertain(),
      current = this.current();
    if (!failure || failure.scope !== this.rpc.authenticatedScope())
      return false;
    return this.loading() || !current || current.read <= failure.read;
  });
  readonly allowed = computed(
    () =>
      !this.loading() &&
      !this.readError() &&
      !this.pending() &&
      !this.needsCheck() &&
      this.state()?.decision === "accepted",
  );
  readonly canDecide = computed(
    () =>
      !!this.state()?.required &&
      !this.loading() &&
      !this.readError() &&
      !this.pending() &&
      !this.needsCheck(),
  );

  async decide(decision: AssistantConsentDecision) {
    const current = this.current();
    if (!current || !this.canDecide()) return false;
    const confirmed = await this.command.run(
      (scope, signal) =>
        scope.client.assistant.decideConsent.mutate(
          {
            policyKey: current.state.policy.key,
            expectedRevision: current.state.revision,
            decision,
          },
          { signal },
        ),
      (state) => {
        this.snapshot.set({ ...current, state });
        this.uncertain.set(null);
      },
    );
    if (
      !confirmed &&
      !this.lifetime.destroyed &&
      !current.scope.signal.aborted &&
      current.scope === this.rpc.authenticatedScope()
    )
      this.uncertain.set({
        scope: current.scope,
        read: this.readVersion(),
      });
    return confirmed;
  }

  /** Ordinary reopening rechecks permission, but cannot resolve an uncertain save. */
  reload() {
    if (!this.pending()) this.snapshot.reload();
  }

  check() {
    if (this.pending()) return;
    this.command.clear();
    this.readVersion.update((version) => version + 1);
  }
}
