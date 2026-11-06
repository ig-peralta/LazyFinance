import { z } from "zod";
import {
  TagCreateInputSchema,
  TagRuleInputSchema,
} from "../tags/tag-rule.schema";

export const TagCreateSchema = TagCreateInputSchema;
export const TagRuleCreateSchema = TagRuleInputSchema;
export const TagRuleReplaceSchema = z.strictObject({
  id: z.uuid(),
  rule: TagRuleInputSchema,
});
export const TagRuleRecordSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  tagId: z.uuid(),
  accountId: z.uuid().nullable(),
  direction: z.enum(["debit", "credit"]),
  matchField: z.enum(["merchant", "description"]),
  matchValue: z.string(),
  priority: z.number().int(),
  mode: z.enum(["suggest", "auto"]),
  approvedAt: z.iso.datetime().nullable(),
  active: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export const TagRuleRecordsSchema = z.array(TagRuleRecordSchema).max(10000);
export const MatchingRuleSchema = TagRuleRecordSchema.extend({
  tagName: z.string(),
});
export const TransactionRecordSchema = z.object({
  id: z.uuid(),
  accountId: z.uuid(),
  tagId: z.uuid().nullable(),
  tagDecisionOrigin: z.enum(["unreviewed", "manual", "rule"]),
  tagRuleId: z.uuid().nullable(),
  tagDecidedAt: z.iso.datetime().nullable(),
  bookedAt: z.iso.datetime(),
  bookedPrecision: z.enum(["instant", "calendar_day"]),
  bookedOn: z.iso.date().nullable(),
  amount: z.string(),
  type: z.enum(["debit", "credit"]),
  source: z.enum(["manual", "provider"]),
  merchant: z.string().nullable(),
  description: z.string().nullable(),
  externalId: z.string().nullable(),
  providerUpdatedAt: z.iso.datetime().nullable(),
  providerObservedAt: z.iso.datetime().nullable(),
  providerKind: z
    .enum(["transfer", "card_payment", "reversal", "other", "unknown"])
    .nullable(),
  relationKind: z
    .enum(["transfer_pair", "card_payment_pair", "reversal"])
    .nullable(),
  relatedAccountExternalId: z.string().nullable(),
  relatedMovementExternalId: z.string().nullable(),
  counterpartyHolder: z
    .object({ scheme: z.string(), value: z.string() })
    .nullable(),
  isInternalMovement: z.boolean().nullable(),
  providerInternalAssessment: z.enum(["internal", "external", "unknown"]),
  userInternalOverride: z.boolean().nullable(),
  reviewStatus: z.enum(["clear", "needs_review"]),
  removedAt: z.iso.datetime().nullable(),
  removalReason: z.enum(["removed", "reversed"]).nullable(),
  createdAt: z.iso.datetime(),
});
export const TaggingFactsSchema = z.object({
  movement: TransactionRecordSchema,
  rules: z.array(MatchingRuleSchema).max(10000),
});
export const ManualTagCommandSchema = z.strictObject({
  transactionId: z.uuid(),
  tagId: z.uuid().nullable(),
});
export const RuleCandidatesInputSchema = z.strictObject({
  ruleId: z.uuid(),
  after: z.uuid().optional(),
});
export const RuleCandidatesSchema = z.object({
  rule: TagRuleRecordSchema,
  rules: z.array(MatchingRuleSchema).max(10000),
  movements: z.array(TransactionRecordSchema).max(1001),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
});
export const PreparedTagDecisionSchema = z.strictObject({
  transactionId: z.uuid(),
  tagId: z.uuid().nullable(),
  ruleId: z.uuid().nullable(),
});
export const CommitRuleDecisionsSchema = z
  .strictObject({
    ruleId: z.uuid(),
    after: z.uuid().optional(),
    expectedFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    decisions: z.array(PreparedTagDecisionSchema).max(1000),
  })
  .refine(
    (value) =>
      new Set(value.decisions.map((item) => item.transactionId)).size ===
      value.decisions.length,
    "Duplicate movement decisions",
  );
export const ChangedCountSchema = z.object({
  changed: z.number().int().nonnegative(),
});
export type TagRuleRecord = z.infer<typeof TagRuleRecordSchema>;
export type MatchingRule = z.infer<typeof MatchingRuleSchema>;
export type TransactionRecord = z.infer<typeof TransactionRecordSchema>;
export type RuleCandidatesInput = z.infer<typeof RuleCandidatesInputSchema>;
export type CommitRuleDecisions = z.infer<typeof CommitRuleDecisionsSchema>;
