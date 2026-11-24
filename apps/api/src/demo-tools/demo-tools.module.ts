import { Module } from "@nestjs/common";
import { BankingSyncModule } from "../banking/synchronization/banking-sync.module";
import { EnvironmentModule } from "../environment/environment.module";
import { PersistenceModule } from "../persistence/persistence.module";
import { DemoToolsRpc } from "./demo-tools.rpc";
import { DemoToolsService } from "./demo-tools.service";

@Module({
  imports: [EnvironmentModule, PersistenceModule, BankingSyncModule],
  providers: [DemoToolsRpc, DemoToolsService],
})
export class DemoToolsModule {}
