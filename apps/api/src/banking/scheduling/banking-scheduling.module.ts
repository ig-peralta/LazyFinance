import { Module } from "@nestjs/common";
import { EnvironmentModule } from "../../environment/environment.module";
import { PersistenceModule } from "../../persistence/persistence.module";
import { FintocModule } from "../fintoc/fintoc.module";
import { BankingSyncModule } from "../synchronization/banking-sync.module";
import { BankingSyncRunner } from "./banking-sync-runner";
import { BankingSyncTimer } from "./banking-sync-timer";

@Module({
  imports: [
    EnvironmentModule,
    PersistenceModule,
    FintocModule,
    BankingSyncModule,
  ],
  providers: [BankingSyncRunner, BankingSyncTimer],
  exports: [BankingSyncRunner],
})
export class BankingSchedulingModule {}
