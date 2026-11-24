import { Module } from "@nestjs/common";
import { EnvironmentModule } from "../../environment/environment.module";
import { PersistenceModule } from "../../persistence/persistence.module";
import { FintocDiscoveryService } from "../fintoc/discovery/fintoc-discovery.service";
import { FintocModule } from "../fintoc/fintoc.module";
import { FintocImportService } from "../fintoc/import/fintoc-import.service";
import { BankingIngestionModule } from "../ingestion/banking-ingestion.module";
import { MockBankService } from "../mock/mock-bank.service";

/** Reusable application boundary: no public routers, auth, timer or listener. */
@Module({
  imports: [
    PersistenceModule,
    FintocModule,
    BankingIngestionModule,
    EnvironmentModule,
  ],
  providers: [FintocImportService, FintocDiscoveryService, MockBankService],
  exports: [
    FintocImportService,
    FintocDiscoveryService,
    MockBankService,
    BankingIngestionModule,
  ],
})
export class BankingSyncModule {}
