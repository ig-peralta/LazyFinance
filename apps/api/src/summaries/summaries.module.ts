import { Module } from "@nestjs/common";
import { FinancialEvidenceModule } from "../finance/financial-evidence.module";
import { IncomeModule } from "../income/income.module";
import { PersistenceModule } from "../persistence/persistence.module";
import { SummariesMcpController } from "./summaries.mcp";
import { SummariesRpc } from "./summaries.rpc";
import { SummariesService } from "./summaries.service";

@Module({
  imports: [PersistenceModule, IncomeModule, FinancialEvidenceModule],
  controllers: [SummariesMcpController],
  providers: [SummariesService, SummariesRpc],
})
export class SummariesModule {}
