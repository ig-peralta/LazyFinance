import { z } from 'zod';
import { AccountSummarySchema } from '../accounts';

export const RecentTransactionSchema = z.object({
  id: z.uuid(),
  bookedAt: z.iso.datetime(),
  amount: z.string(),
  type: z.enum(['debit', 'credit']),
  merchant: z.string().nullable(),
  description: z.string().nullable(),
  account: AccountSummarySchema.pick({ id: true, alias: true, type: true, currency: true }),
  tags: z.array(z.object({
    id: z.uuid(),
    name: z.string(),
    color: z.string().nullable(),
  })),
});

export type RecentTransaction = z.infer<typeof RecentTransactionSchema>;
