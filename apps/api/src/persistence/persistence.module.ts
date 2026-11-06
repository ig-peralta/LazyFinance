import { Module } from "@nestjs/common";
import { EnvironmentModule } from "../environment/environment.module";
import { AccountClient } from "./accounts.client";
import { ObjectiveClient } from "./objectives.client";
import { PersistenceClient } from "./persistence.client";
import { TagClient } from "./tags.client";
import { TransactionClient } from "./transactions.client";

@Module({
  imports: [EnvironmentModule],
  providers: [
    PersistenceClient,
    AccountClient,
    TransactionClient,
    ObjectiveClient,
    TagClient,
  ],
  exports: [
    PersistenceClient,
    AccountClient,
    TransactionClient,
    ObjectiveClient,
    TagClient,
  ],
})
export class PersistenceModule {}
