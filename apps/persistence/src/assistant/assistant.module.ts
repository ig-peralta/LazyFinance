import { Module } from "@nestjs/common";
import { ActionModule } from "../actions/action.module";
import { DatabaseModule } from "../database/database.module";
import { AssistantRepository } from "./assistant.repository";
import { AssistantConversationsRpc } from "./assistant.rpc";
import { AssistantConsentRepository } from "./assistant-consent.repository";
import { AssistantConsentRpc } from "./assistant-consent.rpc";

@Module({
  imports: [DatabaseModule, ActionModule],
  providers: [
    AssistantRepository,
    AssistantConversationsRpc,
    AssistantConsentRepository,
    AssistantConsentRpc,
  ],
})
export class AssistantModule {}
