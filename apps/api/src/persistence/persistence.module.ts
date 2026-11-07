import { Module } from "@nestjs/common";
import { EnvironmentModule } from "../environment/environment.module";
import { PersistenceClient } from "./persistence.client";

@Module({
  imports: [EnvironmentModule],
  providers: [PersistenceClient],
  exports: [PersistenceClient],
})
export class PersistenceModule {}
