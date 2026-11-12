import { z } from "zod";
import { AssistantEventSchema } from "../assistant";

export const AssistantVoiceOfferSchema = z.strictObject({
  conversationId: z.uuid(),
  sdp: z.string().min(1).max(64_000).startsWith("v=0"),
});
export const AssistantVoiceSessionSchema = z.strictObject({
  id: z.uuid(),
  sdp: z.string().min(1).max(64_000),
  expiresAt: z.iso.datetime(),
});
export const AssistantVoiceEndSchema = z.strictObject({ id: z.uuid() });
export const AssistantVoiceConfigurationSchema = z.strictObject({
  enabled: z.boolean(),
});
export const AssistantVoiceProblemCodeSchema = z.enum([
  "rate_limited",
  "capacity",
  "session_active",
  "unavailable",
  "setup_failed",
  "connection_lost",
  "provider_error",
  "output_limit",
  "turn_unconfirmed",
]);
export const AssistantVoiceProblemSchema = z.object({
  code: AssistantVoiceProblemCodeSchema,
  retryAfterSeconds: z.number().int().min(1).max(3600).optional(),
});
export type AssistantVoiceProblemCode = z.infer<
  typeof AssistantVoiceProblemCodeSchema
>;
export const AssistantVoicePresentationRequestSchema = z.discriminatedUnion(
  "kind",
  [
    z.strictObject({
      kind: z.literal("source"),
      sourceId: z.string().regex(/^F[1-8]$/),
    }),
    z.strictObject({ kind: z.literal("proposal"), actionId: z.uuid() }),
  ],
);
export type AssistantVoicePresentationRequest = z.infer<
  typeof AssistantVoicePresentationRequestSchema
>;
export const AssistantVoicePresentationEventSchema = z.strictObject({
  type: z.literal("presentation"),
  turnId: z.uuid(),
  presentation: AssistantVoicePresentationRequestSchema,
});
export type AssistantVoicePresentationEvent = z.infer<
  typeof AssistantVoicePresentationEventSchema
>;
export const AssistantVoiceEventSchema = z.union([
  AssistantEventSchema,
  AssistantVoicePresentationEventSchema,
  AssistantVoiceProblemSchema.extend({ type: z.literal("voice_error") }),
  z.object({
    type: z.literal("voice_warning"),
    code: z.enum(["output_limit", "turn_unconfirmed"]),
  }),
  z.object({
    type: z.literal("phase"),
    state: z.enum(["listening", "querying", "responding"]),
  }),
]);
export type AssistantVoiceEvent = z.infer<typeof AssistantVoiceEventSchema>;
