import { z } from "zod";
import {
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
export type BeginAssistantTurn = z.infer<typeof BeginAssistantTurnSchema>;
export type FinishAssistantTurn = z.infer<typeof FinishAssistantTurnSchema>;
