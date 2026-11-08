import { Module } from "@nestjs/common";
import { EnvironmentModule } from "../../environment/environment.module";
import { PersistenceModule } from "../../persistence/persistence.module";
import { FINTOC_FETCH, FintocClient } from "../fintoc/client/fintoc-client";
import { FintocCredentials } from "../fintoc/credentials/fintoc-credentials";
import { FintocImportService } from "../fintoc/import/fintoc-import.service";
import { BankingIngestionModule } from "../ingestion/banking-ingestion.module";
import { BankingLinksRpc } from "./banking-links.rpc";
import { BankingLinksService } from "./banking-links.service";

@Module({
  imports: [EnvironmentModule, PersistenceModule, BankingIngestionModule],
  providers: [
    BankingLinksRpc,
    BankingLinksService,
    FintocClient,
    FintocCredentials,
    FintocImportService,
    { provide: FINTOC_FETCH, useFactory: () => fetch },
  ],
})
export class BankingLinksModule {}
