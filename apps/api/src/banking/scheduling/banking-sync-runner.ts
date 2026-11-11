import { Injectable, Logger } from "@nestjs/common";
import { EnvironmentService } from "../../environment/environment.service";
import { PersistenceClient } from "../../persistence/persistence.client";
import { FintocClient } from "../fintoc/client/fintoc-client";
import { FintocImportService } from "../fintoc/import/fintoc-import.service";

/** One bounded invocation, shared by timer, queue and headless hosts. */
@Injectable()
export class BankingSyncRunner {
  private readonly logger = new Logger(BankingSyncRunner.name);

  constructor(
    private readonly environment: EnvironmentService,
    private readonly persistence: PersistenceClient,
    private readonly fintoc: FintocClient,
    private readonly imports: FintocImportService,
  ) {}

  async runOnce(signal?: AbortSignal) {
    const config = this.fintoc.configuration();
    if (
      !this.environment.get("BANKING_AUTOMATIC_SYNC_ENABLED") ||
      !config.enabled ||
      signal?.aborted
    )
      return;
    const claim = await this.persistence
      .bankingScheduler()
      .providerScheduler.claim.mutate({ mode: config.mode }, { signal });
    if (!claim) return;
    try {
      return await this.imports.importSnapshot(
        claim.userId,
        claim.connectionId,
        { claim, signal },
      );
    } catch {
      // Lost responses are not permission to replay. Atomically saved completion
      // and durable claim/run leases decide eligibility on the next wake-up.
      this.logger.warn(
        "Bank synchronization was not confirmed; durable state will be reconciled",
      );
      return;
    }
  }
}
