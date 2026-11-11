import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module";
import { ProviderLinkRepository } from "../provider-link/provider-link.repository";
import { ProviderLinkRpc } from "../provider-link/provider-link.rpc";
import { ProviderRequestRepository } from "../provider-scheduling/provider-request.repository";
import { ProviderScheduleRepository } from "../provider-scheduling/provider-schedule.repository";
import {
  ProviderRequestsRpc,
  ProviderSchedulerRpc,
} from "../provider-scheduling/provider-scheduling.rpc";
import { ProviderSelectionRepository } from "../provider-selection/provider-selection.repository";
import { ProviderSelectionRpc } from "../provider-selection/provider-selection.rpc";
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
    ProviderSelectionRepository,
    ProviderSelectionRpc,
    ProviderScheduleRepository,
    ProviderRequestRepository,
    ProviderSchedulerRpc,
    ProviderRequestsRpc,
  ],
})
export class ProviderConnectionModule {}
