import { z } from 'zod';
import { TagSummarySchema } from '../tags';

export const ObjectiveSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  amount: z.string(),
  kind: z.enum(['time_based', 'amount_based']),
  intent: z.enum(['spending', 'saving']),
  isRecurring: z.boolean().nullable(),
  period: z.enum(['daily', 'weekly', 'monthly', 'yearly']).nullable(),
  startDate: z.iso.datetime().nullable(),
  endDate: z.iso.datetime().nullable(),
  tags: z.array(TagSummarySchema),
});

export type ObjectiveSummary = z.infer<typeof ObjectiveSummarySchema>;
