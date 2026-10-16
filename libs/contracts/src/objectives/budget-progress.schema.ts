import { z } from 'zod';
import { MonthSchema } from '../summaries';

export const BudgetProgressSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  month: MonthSchema,
  period: z.enum(['monthly', 'yearly', 'fixed']),
  limit: z.string(),
  spent: z.string(),
  remaining: z.string(),
  percentage: z.number().int().nonnegative(),
});

export type BudgetProgress = z.infer<typeof BudgetProgressSchema>;
