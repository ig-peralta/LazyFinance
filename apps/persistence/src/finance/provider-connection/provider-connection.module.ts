import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module";
import { ProviderLinkRepository } from "../provider-link/provider-link.repository";
import { ProviderLinkRpc } from "../provider-link/provider-link.rpc";
import { TagRuleModule } from "../tag-rule/tag-rule.module";
import { ProviderConnectionRepository } from "./provider-connection.repository";
import { ProviderConnectionRpc } from "./provider-connection.rpc";

@Module({
  imports: [DatabaseModule, TagRuleModule],
  providers: [
    ProviderConnectionRepository,
    ProviderConnectionRpc,
    ProviderLinkRepository,
    ProviderLinkRpc,
  ],
})
export class ProviderConnectionModule {}
