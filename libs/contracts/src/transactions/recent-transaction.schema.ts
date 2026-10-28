import { z } from 'zod';
import { AccountSummarySchema } from '../accounts';
import { TagSummarySchema } from '../tags';

export const RecentTransactionSchema = z.object({
  id: z.uuid(),
  bookedAt: z.iso.datetime(),
  amount: z.string(),
  type: z.enum(['debit', 'credit']),
  merchant: z.string().nullable(),
  description: z.string().nullable(),
  account: AccountSummarySchema.pick({ id: true, alias: true, type: true, currency: true }),
  tag: TagSummarySchema.nullable(),
  tagDecisionOrigin: z.enum(['unreviewed', 'manual', 'rule']),
  tagRuleId: z.uuid().nullable(),
  reviewStatus: z.enum(['clear', 'needs_review']),
});

export type RecentTransaction = z.infer<typeof RecentTransactionSchema>;
