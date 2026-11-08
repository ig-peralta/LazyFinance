import { Module } from "@nestjs/common";
import { EnvironmentModule } from "../../environment/environment.module";
import { PersistenceModule } from "../../persistence/persistence.module";
import { FINTOC_FETCH, FintocClient } from "../fintoc/fintoc-client";
import { FintocCredentials } from "../fintoc/fintoc-credentials";
import { BankingLinksRpc } from "./banking-links.rpc";
import { BankingLinksService } from "./banking-links.service";

@Module({
  imports: [EnvironmentModule, PersistenceModule],
  providers: [
    BankingLinksRpc,
    BankingLinksService,
    FintocClient,
    FintocCredentials,
    { provide: FINTOC_FETCH, useFactory: () => fetch },
  ],
})
export class BankingLinksModule {}
