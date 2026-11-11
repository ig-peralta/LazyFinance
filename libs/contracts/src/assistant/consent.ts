import { z } from "zod";

export const ASSISTANT_CONSENT_POLICY_VERSION = 1;
export const AssistantConsentPolicyKeySchema = z
  .string()
  .regex(/^[a-f0-9]{64}$/);
export const AssistantConsentDecisionSchema = z.enum(["accepted", "refused"]);
export const AssistantConsentPolicySchema = z.strictObject({
  key: AssistantConsentPolicyKeySchema,
  version: z.literal(ASSISTANT_CONSENT_POLICY_VERSION),
  provider: z.string().max(100),
  model: z.string().max(200),
  endpoint: z.string().max(2048).nullable(),
});
export const AssistantConsentStateSchema = z.strictObject({
  required: z.boolean(),
  policy: AssistantConsentPolicySchema,
  decision: z.enum(["unset", "accepted", "refused"]),
  revision: z.number().int().min(0).max(2_147_483_647),
  decidedAt: z.iso.datetime().nullable(),
});
export const DecideAssistantConsentSchema = z.strictObject({
  policyKey: AssistantConsentPolicyKeySchema,
  expectedRevision: z.number().int().min(0).max(2_147_483_646),
  decision: AssistantConsentDecisionSchema,
});

export type AssistantConsentState = z.infer<typeof AssistantConsentStateSchema>;
export type AssistantConsentDecision = z.infer<
  typeof AssistantConsentDecisionSchema
>;
export type DecideAssistantConsent = z.infer<
  typeof DecideAssistantConsentSchema
>;
