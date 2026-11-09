import { Module } from "@nestjs/common";
import { PersistenceModule } from "../persistence/persistence.module";
import { TransactionsMcpController } from "./transactions.mcp";
import { TransactionsRpc } from "./transactions.rpc";
import { TransactionsService } from "./transactions.service";

@Module({
  imports: [PersistenceModule],
  controllers: [TransactionsMcpController],
  providers: [TransactionsService, TransactionsRpc],
  exports: [TransactionsService],
})
export class TransactionsModule {}
