import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module";
import { TagRuleModule } from "../tag-rule/tag-rule.module";
import { ProviderConnectionRepository } from "./provider-connection.repository";
import { ProviderConnectionRpc } from "./provider-connection.rpc";

@Module({
  imports: [DatabaseModule, TagRuleModule],
  providers: [ProviderConnectionRepository, ProviderConnectionRpc],
})
export class ProviderConnectionModule {}
