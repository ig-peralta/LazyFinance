import { Module } from "@nestjs/common";
import { PersistenceModule } from "../persistence/persistence.module";
import { IncomeMcpController } from "./income.mcp";
import { IncomeRpc } from "./income.rpc";
import { IncomeService } from "./income.service";

@Module({
  imports: [PersistenceModule],
  controllers: [IncomeMcpController],
  providers: [IncomeService, IncomeRpc],
  exports: [IncomeService],
})
export class IncomeModule {}
