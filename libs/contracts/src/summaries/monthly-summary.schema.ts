import { z } from 'zod';
import { TagSummarySchema } from '../tags';
import { ExpectedIncomeTotalsSchema } from '../income/income-expectation.schema';
import { UnclassifiedCreditsSchema } from '../income/income-receipt.schema';
import { MonthSchema } from './month.schema';

export { MonthSchema, type Month } from './month.schema';

export const MonthlySummarySchema = z.object({
  month: MonthSchema,
  expectedIncome: ExpectedIncomeTotalsSchema,
  receivedIncome: z.string(),
  unclassifiedCredits: UnclassifiedCreditsSchema,
  spending: z.string(),
  unresolvedMovementCount: z.number().int().nonnegative().optional(),
  tags: z.array(TagSummarySchema.extend({ amount: z.string(), count: z.number().int() })),
});

export type MonthlySummary = z.infer<typeof MonthlySummarySchema>;
