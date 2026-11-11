import { z } from "zod";
import {
  ASSISTANT_MAX_INPUT,
  AssistantConversationSchema,
  AssistantSendSchema,
  AssistantTurnSchema,
} from "../assistant";

export const BeginAssistantTurnSchema = AssistantSendSchema.extend({
  lease: z.uuid(),
});
export const BeginAssistantTurnResultSchema = z.object({
  acquired: z.boolean(),
  conversation: AssistantConversationSchema,
  turn: AssistantTurnSchema,
});
export const FinishAssistantTurnSchema = z.strictObject({
  conversationId: z.uuid(),
  lease: z.uuid(),
  turn: AssistantTurnSchema.refine((turn) => turn.status !== "pending"),
});
export const FinishAssistantTurnResultSchema = z.object({ saved: z.boolean() });
export const RecordAssistantVoiceQuestionSchema = z.strictObject({
  conversationId: z.uuid(),
  turnId: z.uuid(),
  question: z.string().trim().min(1).max(ASSISTANT_MAX_INPUT),
});
export type BeginAssistantTurn = z.infer<typeof BeginAssistantTurnSchema>;
export type FinishAssistantTurn = z.infer<typeof FinishAssistantTurnSchema>;
export type RecordAssistantVoiceQuestion = z.infer<
  typeof RecordAssistantVoiceQuestionSchema
>;
