import { z } from "zod";

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
