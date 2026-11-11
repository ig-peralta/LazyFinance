import { Module } from "@nestjs/common";
import { PersistenceModule } from "../../persistence/persistence.module";
import { FintocDiscoveryService } from "../fintoc/discovery/fintoc-discovery.service";
import { FintocModule } from "../fintoc/fintoc.module";
import { FintocImportService } from "../fintoc/import/fintoc-import.service";
import { BankingIngestionModule } from "../ingestion/banking-ingestion.module";

/** Reusable application boundary: no public routers, auth, timer or listener. */
@Module({
  imports: [PersistenceModule, FintocModule, BankingIngestionModule],
  providers: [FintocImportService, FintocDiscoveryService],
  exports: [
    FintocImportService,
    FintocDiscoveryService,
    BankingIngestionModule,
  ],
})
export class BankingSyncModule {}
