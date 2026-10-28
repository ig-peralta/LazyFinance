import { z } from 'zod';

export const TagCreateInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().default(null),
}).strict();

export const TagRuleInputSchema = z.object({
  tagId: z.uuid(),
  accountId: z.uuid().nullable().default(null),
  direction: z.enum(['debit', 'credit']),
  matchField: z.enum(['merchant', 'description']),
  matchValue: z.string().trim().min(1).max(240),
  priority: z.number().int().min(0).max(100).default(0),
  autoApply: z.boolean().default(false),
}).strict().superRefine((rule, ctx) => {
  if (rule.autoApply && rule.matchField !== 'merchant') {
    ctx.addIssue({ code: 'custom', path: ['autoApply'], message: 'Automatic rules require a structured merchant match' });
  }
});

export type TagCreateInput = z.infer<typeof TagCreateInputSchema>;
export type TagRuleInput = z.infer<typeof TagRuleInputSchema>;

export const TagSuggestionSchema = z.object({
  ruleId: z.uuid(),
  tagId: z.uuid(),
  tagName: z.string(),
  confidence: z.enum(['high', 'medium']),
  reason: z.enum(['merchant_exact', 'description_exact']),
  autoApply: z.boolean(),
});
export type TagSuggestion = z.infer<typeof TagSuggestionSchema>;
