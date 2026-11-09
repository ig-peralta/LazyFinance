import { Module } from "@nestjs/common";
import { PersistenceModule } from "../persistence/persistence.module";
import { TaggingModule } from "../transactions/tagging/tagging.module";
import { TransactionsModule } from "../transactions/transactions.module";
import { ActionsMcpController } from "./actions.mcp";
import { ActionsRpc } from "./actions.rpc";
import { ActionsService } from "./actions.service";

@Module({
  imports: [PersistenceModule, TaggingModule, TransactionsModule],
  controllers: [ActionsMcpController],
  providers: [ActionsService, ActionsRpc],
  exports: [ActionsService],
})
export class ActionsModule {}
