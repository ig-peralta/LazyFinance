import { Module } from "@nestjs/common";
import { PersistenceModule } from "../persistence/persistence.module";
import { ObjectivesMcpController } from "./objectives.mcp";
import { ObjectivesRpc } from "./objectives.rpc";
import { ObjectivesService } from "./objectives.service";
import { SavingsGoalsService } from "./savings-goals.service";

@Module({
  imports: [PersistenceModule],
  controllers: [ObjectivesMcpController],
  providers: [ObjectivesService, SavingsGoalsService, ObjectivesRpc],
})
export class ObjectivesModule {}
