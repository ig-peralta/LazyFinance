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
export const AssistantVoiceEventSchema = z.union([
  AssistantEventSchema,
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
