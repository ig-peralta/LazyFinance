import { z } from 'zod';
import { MonthSchema } from './monthly-summary.schema';

export const MonthlyComparisonSchema = z.object({
  month: MonthSchema,
  previousMonth: MonthSchema,
  partial: z.boolean(),
  receivedIncome: z.object({ current: z.string(), previous: z.string(), change: z.string() }),
  spending: z.object({ current: z.string(), previous: z.string(), change: z.string() }),
  unresolvedMovementCount: z.object({ current: z.number().int().nonnegative(), previous: z.number().int().nonnegative() }).optional(),
});

export type MonthlyComparison = z.infer<typeof MonthlyComparisonSchema>;
