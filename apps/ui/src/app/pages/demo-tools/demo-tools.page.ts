import { Component, computed, inject, signal } from "@angular/core";
import type { DemoDataResetResult } from "@lazyfinance/contracts";
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
    value: DemoDataResetResult;
  } | null>(null);
  protected readonly confirmation = computed(() => {
    const result = this.result();
    if (!result || result.userId !== this.session.user()?.userId) return null;
    return result.value;
  });
  protected readonly command = createScopedCommand(
    () => this.session.user()?.userId,
  );

  constructor() {
    reportWorkspaceReadiness();
  }

  protected requestReset(): void {
    this.result.set(null);
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
        if (this.session.user()?.userId === userId) {
          this.result.set({ userId, value });
          this.assistantWorkspace.demoDataReset();
        }
      },
      "La cuenta quedó lista para la demo.",
    );
  }
}
