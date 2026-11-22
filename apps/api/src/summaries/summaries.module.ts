import { Module } from "@nestjs/common";
import { FinancialEvidenceModule } from "../finance/financial-evidence.module";
import { IncomeModule } from "../income/income.module";
import { PersistenceModule } from "../persistence/persistence.module";
import { SpendingInsightsService } from "./spending-insights.service";
import { SummariesMcpController } from "./summaries.mcp";
import { SummariesRpc } from "./summaries.rpc";
import { SummariesService } from "./summaries.service";

@Module({
  imports: [PersistenceModule, IncomeModule, FinancialEvidenceModule],
  controllers: [SummariesMcpController],
  providers: [SummariesService, SpendingInsightsService, SummariesRpc],
  exports: [SummariesService, SpendingInsightsService],
})
export class SummariesModule {}
