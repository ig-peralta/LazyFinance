import { z } from 'zod';
import { TagSummarySchema } from '../tags';

export const MonthSchema = z.string().regex(/^[1-9]\d{3}-(0[1-9]|1[0-2])$/);
export type Month = z.infer<typeof MonthSchema>;

export const MonthlySummarySchema = z.object({
  month: MonthSchema,
  income: z.string(),
  spending: z.string(),
  tags: z.array(TagSummarySchema.extend({ amount: z.string(), count: z.number().int() })),
});

export type MonthlySummary = z.infer<typeof MonthlySummarySchema>;
