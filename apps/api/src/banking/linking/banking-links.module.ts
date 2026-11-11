import { Module } from "@nestjs/common";
import { EnvironmentModule } from "../../environment/environment.module";
import { PersistenceModule } from "../../persistence/persistence.module";
import { FintocModule } from "../fintoc/fintoc.module";
import { BankingSyncModule } from "../synchronization/banking-sync.module";
import { BankingLinksRpc } from "./banking-links.rpc";
import { BankingLinksService } from "./banking-links.service";

@Module({
  imports: [
    EnvironmentModule,
    PersistenceModule,
    FintocModule,
    BankingSyncModule,
  ],
  providers: [BankingLinksRpc, BankingLinksService],
})
export class BankingLinksModule {}
