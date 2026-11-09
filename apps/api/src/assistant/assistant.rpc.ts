import {
  AssistantConfigurationSchema,
  AssistantConversationIdSchema,
  AssistantConversationSchema,
  AssistantConversationsSchema,
  AssistantRemovedSchema,
  CreateAssistantConversationSchema,
  RpcEmptySchema,
} from "@lazyfinance/contracts";
import { Ctx, Input, Mutation, Query, Router } from "nestjs-trpc";
import { type ApiRequestContext, rpcUser } from "../rpc/context";
import { AssistantService } from "./assistant.service";

@Router({ alias: "assistant" })
export class AssistantRpc {
  constructor(private readonly assistant: AssistantService) {}

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
    return this.assistant.conversations(rpcUser(ctx)).get.query(input);
  }

  @Mutation({
    input: CreateAssistantConversationSchema,
    output: AssistantConversationSchema,
    meta: { auth: "user" },
  })
  createConversation(@Ctx() ctx: ApiRequestContext) {
    return this.assistant.conversations(rpcUser(ctx)).create.mutate();
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
