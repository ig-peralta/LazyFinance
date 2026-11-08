import { Module } from "@nestjs/common";
import { PersistenceModule } from "../../persistence/persistence.module";
import { BankingSyncStatusService } from "../status/banking-sync-status.service";
import { BankingIngestionService } from "./banking-ingestion.service";

@Module({
  imports: [PersistenceModule],
  providers: [BankingIngestionService, BankingSyncStatusService],
  exports: [BankingIngestionService, BankingSyncStatusService],
})
export class BankingIngestionModule {}
