import { Component, computed, inject, signal } from "@angular/core";
import type {
  DemoDataResetResult,
  DemoTransactionResult,
} from "@lazyfinance/contracts";
import { SessionService } from "../../core/auth/session.service";
import { reportWorkspaceReadiness } from "../../core/rendering/workspace-preparation";
import { RpcClient, type RpcScope } from "../../core/rpc/rpc-client";
import { createScopedCommand } from "../../core/rpc/scoped-command";
import { AssistantWorkspace } from "../../features/assistant/assistant-workspace";

@Component({
  selector: "demo-tools-page",
  templateUrl: "./demo-tools.page.html",
})
export class DemoToolsPage {
  protected readonly session = inject(SessionService);
  private readonly rpc = inject(RpcClient);
  private readonly confirmationOwner = signal<{
    userId: string;
    scope: RpcScope;
  } | null>(null);
  protected readonly confirmationRequired = computed(
    () =>
      this.session.demoToolsEnabled() &&
      this.confirmationOwner() !== null &&
      this.confirmationOwner()?.userId === this.session.user()?.userId &&
      this.confirmationOwner()?.scope === this.rpc.authenticatedScope(),
  );
  private readonly assistantWorkspace = inject(AssistantWorkspace);
  private readonly result = signal<{
    userId: string;
    scope: RpcScope;
    value: DemoDataResetResult;
  } | null>(null);
  protected readonly confirmation = computed(() => {
    const result = this.result();
    if (
      !result ||
      result.userId !== this.session.user()?.userId ||
      result.scope !== this.rpc.authenticatedScope()
    )
      return null;
    return result.value;
  });
  protected readonly command = createScopedCommand(
    () => this.session.user()?.userId,
  );
  private readonly generated = signal<{
    userId: string;
    scope: RpcScope;
    value: DemoTransactionResult;
  } | null>(null);
  protected readonly created = computed(() => {
    const result = this.generated();
    return result &&
      result.userId === this.session.user()?.userId &&
      result.scope === this.rpc.authenticatedScope()
      ? result.value
      : null;
  });

  constructor() {
    reportWorkspaceReadiness();
  }

  protected requestReset(): void {
    this.result.set(null);
    this.generated.set(null);
    const userId = this.session.user()?.userId;
    const scope = this.rpc.authenticatedScope();
    this.confirmationOwner.set(
      this.session.demoToolsEnabled() && userId && scope
        ? { userId, scope }
        : null,
    );
  }

  protected cancelReset(): void {
    this.confirmationOwner.set(null);
  }

  protected async reset(): Promise<void> {
    if (!this.confirmationRequired()) return;
    const userId = this.session.user()?.userId;
    if (!userId) return;

    this.confirmationOwner.set(null);
    await this.command.run(
      (scope, signal) =>
        scope.client.demoTools.resetDemoData.mutate(undefined, { signal }),
      (value) => {
        const scope = this.rpc.authenticatedScope();
        if (scope && this.session.user()?.userId === userId) {
          this.result.set({ userId, scope, value });
          this.assistantWorkspace.demoDataReset();
        }
      },
      "La cuenta quedó lista para la demo.",
    );
  }

  protected async create(kind: "internal" | "external"): Promise<void> {
    const userId = this.session.user()?.userId;
    if (!this.session.demoToolsEnabled() || !userId) return;
    this.confirmationOwner.set(null);
    this.result.set(null);
    this.generated.set(null);
    await this.command.run(
      (scope, signal) =>
        kind === "internal"
          ? scope.client.demoTools.createInternalTransaction.mutate(undefined, {
              signal,
            })
          : scope.client.demoTools.createExternalTransaction.mutate(undefined, {
              signal,
            }),
      (value) => {
        const scope = this.rpc.authenticatedScope();
        if (scope && this.session.user()?.userId === userId)
          this.generated.set({ userId, scope, value });
      },
      "Movimiento de demostración creado.",
    );
  }
}
