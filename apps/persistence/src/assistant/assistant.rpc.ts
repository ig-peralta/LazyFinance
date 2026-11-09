import {
  AssistantConversationIdSchema,
  AssistantConversationSchema,
  AssistantConversationsSchema,
  AssistantRemovedSchema,
  CreateAssistantConversationSchema,
  RpcEmptySchema,
} from "@lazyfinance/contracts";
import {
  type BeginAssistantTurn,
  BeginAssistantTurnResultSchema,
  BeginAssistantTurnSchema,
  type FinishAssistantTurn,
  FinishAssistantTurnResultSchema,
  FinishAssistantTurnSchema,
} from "@lazyfinance/contracts/internal";
import { Input, Mutation, Query, Router } from "nestjs-trpc";
import { AssistantRepository } from "./assistant.repository";

@Router({ alias: "assistantConversations" })
export class AssistantConversationsRpc {
  constructor(private readonly repository: AssistantRepository) {}

  @Query({
    input: RpcEmptySchema,
    output: AssistantConversationsSchema,
    meta: { context: "user" },
  })
  list() {
    return this.repository.list();
  }

  @Query({
    input: AssistantConversationIdSchema,
    output: AssistantConversationSchema,
    meta: { context: "user" },
  })
  get(@Input() input: { id: string }) {
    return this.repository.get(input.id);
  }

  @Mutation({
    input: CreateAssistantConversationSchema,
    output: AssistantConversationSchema,
    meta: { context: "user" },
  })
  create() {
    return this.repository.create();
  }

  @Mutation({
    input: BeginAssistantTurnSchema,
    output: BeginAssistantTurnResultSchema,
    meta: { context: "user" },
  })
  begin(@Input() input: BeginAssistantTurn) {
    return this.repository.begin(input);
  }

  @Mutation({
    input: FinishAssistantTurnSchema,
    output: FinishAssistantTurnResultSchema,
    meta: { context: "user" },
  })
  finish(@Input() input: FinishAssistantTurn) {
    return this.repository.finish(input);
  }

  @Mutation({
    input: AssistantConversationIdSchema,
    output: AssistantRemovedSchema,
    meta: { context: "user" },
  })
  remove(@Input() input: { id: string }) {
    return this.repository.remove(input.id);
  }
}
