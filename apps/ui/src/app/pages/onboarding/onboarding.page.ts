import { Component, computed, effect, inject, resource } from "@angular/core";
import { Router, RouterLink } from "@angular/router";
import type { FinishOnboarding } from "@lazyfinance/contracts";
import { RpcClient } from "../../core/rpc/rpc-client";
import { createScopedCommand } from "../../core/rpc/scoped-command";
import { OnboardingData } from "../../features/onboarding/onboarding.data";
import { Icon } from "../../shared/ui/icon";

@Component({
  selector: "onboarding-page",
  imports: [RouterLink, Icon],
  templateUrl: "./onboarding.page.html",
})
export class OnboardingPage {
  private readonly rpc = inject(RpcClient);
  private readonly router = inject(Router);
  protected readonly onboarding = inject(OnboardingData);
  protected readonly command = createScopedCommand();
  private readonly scope = computed(() =>
    this.onboarding.status() === "active" ||
    this.onboarding.status() === "skipped"
      ? this.rpc.authenticatedScope()
      : undefined,
  );
  protected readonly accounts = resource({
    params: () => this.scope(),
    loader: ({ params: scope, abortSignal }) =>
      scope.client.accounts.list.query(undefined, { signal: abortSignal }),
    defaultValue: [],
  });
  protected readonly sources = resource({
    params: () => this.scope(),
    loader: ({ params: scope, abortSignal }) =>
      scope.client.income.sources.query(undefined, { signal: abortSignal }),
    defaultValue: [],
  });
  protected readonly objectives = resource({
    params: () => this.scope(),
    loader: ({ params: scope, abortSignal }) =>
      scope.client.objectives.list.query(undefined, { signal: abortSignal }),
    defaultValue: [],
  });
  protected readonly steps = computed(() => [
    {
      title: "Conoce tus cuentas",
      description:
        "Saldos y sincronización informada. Vincular con Fintoc todavía no está disponible.",
      path: "/cuentas",
      icon: "bank" as const,
      loading: this.accounts.isLoading(),
      error: !!this.accounts.error(),
      done: this.accounts.hasValue() && this.accounts.value().length > 0,
      blocked: true,
    },
    {
      title: "Dale forma a tus ingresos",
      description:
        "Declara una fuente y su calendario. Planificar no confirma ingresos recibidos.",
      path: "/ingresos/fuentes",
      icon: "income" as const,
      loading: this.sources.isLoading(),
      error: !!this.sources.error(),
      done:
        this.sources.hasValue() &&
        this.sources.value().some((source) => !source.archivedAt),
      blocked: false,
    },
    {
      title: "Elige un límite que te ayude",
      description:
        "Crea un presupuesto de gasto con etiquetas. Puedes organizar las etiquetas primero.",
      path: "/presupuestos-y-metas",
      icon: "wallet" as const,
      loading: this.objectives.isLoading(),
      error: !!this.objectives.error(),
      done:
        this.objectives.hasValue() &&
        this.objectives.value().some((item) => item.intent === "spending"),
      blocked: false,
    },
    {
      title: "Ponle nombre a una meta",
      description:
        "Define tu objetivo de ahorro. Solo los registros seleccionados medirán su asignación.",
      path: "/metas",
      icon: "target" as const,
      loading: this.objectives.isLoading(),
      error: !!this.objectives.error(),
      done:
        this.objectives.hasValue() &&
        this.objectives.value().some((item) => item.intent === "saving"),
      blocked: false,
    },
  ]);
  protected readonly done = computed(
    () =>
      this.steps().filter((step) => !step.error && !step.loading && step.done)
        .length,
  );

  constructor() {
    // Reconcile other devices or a command whose response was lost on a prior visit.
    if (this.onboarding.status() !== "completed")
      this.onboarding.state.reload();
    effect(() => {
      if (this.onboarding.status() === "completed")
        void this.router.navigateByUrl("/dashboard", { replaceUrl: true });
    });
  }

  protected finish(status: FinishOnboarding["status"]) {
    void this.command.run(
      (scope, signal) =>
        scope.client.onboarding.finish.mutate({ status }, { signal }),
      (state) => {
        // Setting the resource cancels any older read before it can restore a hint.
        this.onboarding.state.set(state);
        if (state.status !== "completed")
          void this.router.navigateByUrl("/dashboard");
      },
    );
  }

  protected reload() {
    this.accounts.reload();
    this.sources.reload();
    this.objectives.reload();
  }
}
