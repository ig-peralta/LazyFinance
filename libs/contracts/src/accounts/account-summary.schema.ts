import { z } from 'zod';

export const AccountSummarySchema = z.object({
  id: z.uuid(),
  alias: z.string().nullable(),
  type: z.enum(['checking', 'savings', 'credit_card']),
  currency: z.literal('CLP'),
  balance: z.string(),
  lastSyncedAt: z.iso.datetime().nullable(),
});

export type AccountSummary = z.infer<typeof AccountSummarySchema>;
