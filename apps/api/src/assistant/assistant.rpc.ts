import {
  AssistantConfigurationSchema,
  AssistantConsentStateSchema,
  AssistantConversationIdSchema,
  AssistantConversationSchema,
  AssistantConversationsSchema,
  AssistantRemovedSchema,
  CreateAssistantConversationSchema,
  type DecideAssistantConsent,
  DecideAssistantConsentSchema,
  RpcEmptySchema,
} from "@lazyfinance/contracts";
import { Ctx, Input, Mutation, Query, Router } from "nestjs-trpc";
import type { z } from "zod";
import { type ApiRequestContext, rpcUser } from "../rpc/context";
import { AssistantService } from "./assistant.service";
import { AssistantConsentService } from "./assistant-consent.service";

@Router({ alias: "assistant" })
export class AssistantRpc {
  constructor(
    private readonly assistant: AssistantService,
    private readonly consentService: AssistantConsentService,
  ) {}

  @Query({
    input: RpcEmptySchema,
    output: AssistantConsentStateSchema,
    meta: { auth: "user" },
  })
  consent(@Ctx() ctx: ApiRequestContext) {
    return this.consentService.state(rpcUser(ctx));
  }

  @Mutation({
    input: DecideAssistantConsentSchema,
    output: AssistantConsentStateSchema,
    meta: { auth: "user" },
  })
  decideConsent(
    @Input() input: DecideAssistantConsent,
    @Ctx() ctx: ApiRequestContext,
  ) {
    return this.consentService.decide(rpcUser(ctx), input);
  }

  @Query({
    input: RpcEmptySchema,
    output: AssistantConfigurationSchema,
    meta: { auth: "user" },
  })
  configuration() {
    return this.assistant.configuration();
  }

  @Query({
    input: RpcEmptySchema,
    output: AssistantConversationsSchema,
    meta: { auth: "user" },
  })
  conversations(@Ctx() ctx: ApiRequestContext) {
    return this.assistant.conversations(rpcUser(ctx)).list.query();
  }

  @Query({
    input: AssistantConversationIdSchema,
    output: AssistantConversationSchema,
    meta: { auth: "user" },
  })
  conversation(@Input() input: { id: string }, @Ctx() ctx: ApiRequestContext) {
    return this.assistant.conversation(rpcUser(ctx), input.id);
  }

  @Query({
    input: AssistantConversationIdSchema,
    output: AssistantConversationSchema,
    meta: { auth: "user" },
  })
  voiceConversation(
    @Input() input: { id: string },
    @Ctx() ctx: ApiRequestContext,
  ) {
    return this.assistant.conversation(rpcUser(ctx), input.id, "voice");
  }

  @Mutation({
    input: CreateAssistantConversationSchema,
    output: AssistantConversationSchema,
    meta: { auth: "user" },
  })
  createConversation(
    @Input() input: z.infer<typeof CreateAssistantConversationSchema>,
    @Ctx() ctx: ApiRequestContext,
  ) {
    return this.assistant.conversations(rpcUser(ctx)).create.mutate(input);
  }

  @Mutation({
    input: AssistantConversationIdSchema,
    output: AssistantRemovedSchema,
    meta: { auth: "user" },
  })
  deleteConversation(
    @Input() input: { id: string },
    @Ctx() ctx: ApiRequestContext,
  ) {
    return this.assistant.conversations(rpcUser(ctx)).remove.mutate(input);
  }
}
