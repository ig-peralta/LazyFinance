import { Module } from "@nestjs/common";
import { EnvironmentModule } from "../../environment/environment.module";
import { PersistenceModule } from "../../persistence/persistence.module";
import { FINTOC_FETCH, FintocClient } from "./client/fintoc-client";
import { FintocRequestAdmission } from "./client/fintoc-request-admission";
import { FintocCredentials } from "./credentials/fintoc-credentials";

@Module({
  imports: [EnvironmentModule, PersistenceModule],
  providers: [
    FintocClient,
    FintocCredentials,
    FintocRequestAdmission,
    { provide: FINTOC_FETCH, useFactory: () => fetch },
  ],
  exports: [FintocClient, FintocCredentials],
})
export class FintocModule {}
