import { Module } from "@nestjs/common";
import { PersistenceModule } from "../persistence/persistence.module";
import { SpendingEvidenceMcpController } from "./spending-evidence.mcp";
import { SpendingEvidenceService } from "./spending-evidence.service";

@Module({
  imports: [PersistenceModule],
  providers: [SpendingEvidenceService],
  controllers: [SpendingEvidenceMcpController],
  exports: [SpendingEvidenceService],
})
export class FinancialEvidenceModule {}
