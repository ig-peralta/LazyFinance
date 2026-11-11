import {
  AssistantConversationIdSchema,
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
  type RecordAssistantVoiceQuestion,
  RecordAssistantVoiceQuestionSchema,
  StoredAssistantConversationSchema,
} from "@lazyfinance/contracts/internal";
import { Input, Mutation, Query, Router } from "nestjs-trpc";
import type { z } from "zod";
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
    output: StoredAssistantConversationSchema,
    meta: { context: "user" },
  })
  get(@Input() input: { id: string }) {
    return this.repository.get(input.id);
  }

  @Mutation({
    input: CreateAssistantConversationSchema,
    output: StoredAssistantConversationSchema,
    meta: { context: "user" },
  })
  create(@Input() input: z.infer<typeof CreateAssistantConversationSchema>) {
    return this.repository.create(input);
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
    input: RecordAssistantVoiceQuestionSchema,
    output: FinishAssistantTurnResultSchema,
    meta: { context: "user" },
  })
  recordVoiceQuestion(@Input() input: RecordAssistantVoiceQuestion) {
    return this.repository.recordVoiceQuestion(input);
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
