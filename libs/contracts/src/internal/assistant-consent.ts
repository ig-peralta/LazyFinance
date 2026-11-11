import { z } from "zod";
import {
  AssistantConsentDecisionSchema,
  AssistantConsentPolicyKeySchema,
} from "../assistant/consent";

export const StoredAssistantConsentSchema = z.strictObject({
  policyKey: AssistantConsentPolicyKeySchema,
  decision: AssistantConsentDecisionSchema,
  revision: z.number().int().min(1).max(2_147_483_647),
  decidedAt: z.iso.datetime(),
});
export type StoredAssistantConsent = z.infer<
  typeof StoredAssistantConsentSchema
>;
