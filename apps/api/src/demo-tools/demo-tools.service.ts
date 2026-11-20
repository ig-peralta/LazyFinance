import { Injectable, NotFoundException } from "@nestjs/common";
import { EnvironmentService } from "../environment/environment.service";
import { PersistenceClient } from "../persistence/persistence.client";

@Injectable()
export class DemoToolsService {
  constructor(
    private readonly environment: EnvironmentService,
    private readonly persistence: PersistenceClient,
  ) {}

  resetDemoData(userId: string) {
    if (!this.environment.get("DEMO_TOOLS_ENABLED"))
      throw new NotFoundException("Demo tools are disabled");
    return this.persistence.user(userId).demoTools.resetDemoData.mutate();
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
}
