import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module";
import { ExternalIdentityRepository } from "./external-identity.repository";
import { ExternalIdentityRpc } from "./external-identity.rpc";

@Module({
  imports: [DatabaseModule],
  providers: [ExternalIdentityRepository, ExternalIdentityRpc],
})
export class ExternalIdentityModule {}
