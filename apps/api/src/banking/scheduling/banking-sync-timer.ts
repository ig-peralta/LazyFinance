import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from "@nestjs/common";
import { EnvironmentService } from "../../environment/environment.service";
import { BankingSyncRunner } from "./banking-sync-runner";

@Injectable()
export class BankingSyncTimer
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private timer?: ReturnType<typeof setTimeout>;
  private pending?: Promise<void>;
  private readonly shutdown = new AbortController();
  private readonly logger = new Logger(BankingSyncTimer.name);

  constructor(
    private readonly environment: EnvironmentService,
    private readonly runner: BankingSyncRunner,
  ) {}

  onApplicationBootstrap() {
    if (this.environment.get("BANKING_AUTOMATIC_SYNC_ENABLED"))
      this.schedule(0);
  }

  private schedule(delay: number) {
    this.timer = setTimeout(() => {
      this.pending = this.tick();
    }, delay);
  }

  private async tick() {
    try {
      await this.runner.runOnce(this.shutdown.signal);
    } catch {
      this.logger.warn("Bank scheduler is unavailable; no work was replayed");
    } finally {
      if (!this.shutdown.signal.aborted) this.schedule(60_000);
    }
  }

  async onModuleDestroy() {
    this.shutdown.abort();
    clearTimeout(this.timer);
    await this.pending;
  }
}
