import { z } from 'zod';

// A null tag is a deliberate user decision, distinct from having no decision.
export const ManualTagDecisionInputSchema = z.object({ tagId: z.uuid().nullable() }).strict();
export type ManualTagDecisionInput = z.infer<typeof ManualTagDecisionInputSchema>;

export const TagDecisionSchema = z.object({
  transactionId: z.uuid(),
  tagId: z.uuid().nullable(),
  origin: z.enum(['unreviewed', 'manual', 'rule']),
  ruleId: z.uuid().nullable(),
  decidedAt: z.iso.datetime().nullable(),
});
export type TagDecision = z.infer<typeof TagDecisionSchema>;
