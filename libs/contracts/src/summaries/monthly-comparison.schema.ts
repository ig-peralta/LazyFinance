import { z } from 'zod';
import { MonthSchema } from './monthly-summary.schema';

export const MonthlyComparisonSchema = z.object({
  month: MonthSchema,
  previousMonth: MonthSchema,
  partial: z.boolean(),
  receivedIncome: z.object({ current: z.string(), previous: z.string(), change: z.string() }),
  spending: z.object({ current: z.string(), previous: z.string(), change: z.string() }),
});

export type MonthlyComparison = z.infer<typeof MonthlyComparisonSchema>;
