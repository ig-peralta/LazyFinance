import { z } from "zod";
import { ExpectedIncomeTotalsSchema } from "../income/income-expectation.schema";
import { UnclassifiedCreditsSchema } from "../income/income-receipt.schema";
import { TagSummarySchema } from "../tags";
import { MonthSchema } from "./month.schema";

export { type Month, MonthSchema } from "./month.schema";

export const MonthlySummarySchema = z.object({
  month: MonthSchema,
  expectedIncome: ExpectedIncomeTotalsSchema,
  receivedIncome: z.string(),
  unclassifiedCredits: UnclassifiedCreditsSchema,
  spending: z.string(),
  unresolvedMovementCount: z.number().int().nonnegative().optional(),
  tags: z.array(
    TagSummarySchema.extend({ amount: z.string(), count: z.number().int() }),
  ),
});

export type MonthlySummary = z.infer<typeof MonthlySummarySchema>;
