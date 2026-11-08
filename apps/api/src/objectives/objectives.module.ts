import { Module } from "@nestjs/common";
import { FinancialEvidenceModule } from "../finance/financial-evidence.module";
import { PersistenceModule } from "../persistence/persistence.module";
import { ObjectivesMcpController } from "./objectives.mcp";
import { ObjectivesRpc } from "./objectives.rpc";
import { ObjectivesService } from "./objectives.service";
import { SavingsGoalsService } from "./savings-goals.service";
import { SavingsProgressService } from "./savings-progress.service";

@Module({
  imports: [PersistenceModule, FinancialEvidenceModule],
  controllers: [ObjectivesMcpController],
  providers: [
    ObjectivesService,
    SavingsGoalsService,
    SavingsProgressService,
    ObjectivesRpc,
  ],
})
export class ObjectivesModule {}
