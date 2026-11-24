import { Injectable, NotFoundException } from "@nestjs/common";
import { MockBankService } from "../banking/mock/mock-bank.service";
import { EnvironmentService } from "../environment/environment.service";
import { PersistenceClient } from "../persistence/persistence.client";

@Injectable()
export class DemoToolsService {
  constructor(
    private readonly environment: EnvironmentService,
    private readonly persistence: PersistenceClient,
    private readonly mock: MockBankService,
  ) {}

  async resetDemoData(userId: string) {
    if (!this.environment.get("DEMO_TOOLS_ENABLED"))
      throw new NotFoundException("Demo tools are disabled");
    const reset = await this.persistence
      .user(userId)
      .demoTools.resetDemoData.mutate();
    return this.finish(userId, reset.connectionId, reset.transactionCount);
  }

  async resumeDemoData(userId: string) {
    if (!this.environment.get("DEMO_TOOLS_ENABLED"))
      throw new NotFoundException("Demo tools are disabled");
    const state = await this.persistence
      .user(userId)
      .demoTools.preparation.query();
    if (!state) throw new NotFoundException("Prepare demo data first");
    if (state.prepared)
      return {
        connectionId: state.connectionId,
        transactionCount: state.transactionCount,
        status: "ready" as const,
      };
    return this.finish(userId, state.connectionId, state.transactionCount);
  }

  private async finish(userId: string, id: string, transactionCount: number) {
    try {
      const outcome = await this.mock.prepare(userId, id);
      if (outcome.status === "complete" || outcome.status === "needs_review")
        return await this.persistence
          .user(userId)
          .demoTools.finalizeDemoData.mutate();
    } catch {
      // The reset was already committed. Do not claim rollback or replay it.
    }
    return {
      connectionId: id,
      transactionCount,
      status: "incomplete" as const,
    };
  }

  createInternalTransaction(userId: string) {
    if (!this.environment.get("DEMO_TOOLS_ENABLED"))
      throw new NotFoundException("Demo tools are disabled");
    return this.persistence
      .user(userId)
      .demoTools.createInternalTransaction.mutate();
  }

  createExternalTransaction(userId: string) {
    if (!this.environment.get("DEMO_TOOLS_ENABLED"))
      throw new NotFoundException("Demo tools are disabled");
    return this.persistence
      .user(userId)
      .demoTools.createExternalTransaction.mutate();
  }

  preparation(userId: string) {
    if (!this.environment.get("DEMO_TOOLS_ENABLED"))
      throw new NotFoundException("Demo tools are disabled");
    return this.persistence.user(userId).demoTools.preparation.query();
  }

  setBankFailure(userId: string, failure: "retryable" | "expired" | null) {
    if (!this.environment.get("DEMO_TOOLS_ENABLED"))
      throw new NotFoundException("Demo tools are disabled");
    return this.persistence
      .user(userId)
      .demoTools.setBankFailure.mutate({ failure });
  }

  changeBankMovement(userId: string, action: "correct" | "remove") {
    if (!this.environment.get("DEMO_TOOLS_ENABLED"))
      throw new NotFoundException("Demo tools are disabled");
    return this.persistence
      .user(userId)
      .demoTools.changeBankMovement.mutate({ action });
  }
}
