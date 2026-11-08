import { z } from "zod";
import { ExpectedIncomeTotalsSchema } from "../income/income-expectation.schema";
import { UnclassifiedCreditsSchema } from "../income/income-receipt.schema";
import { TagSummarySchema } from "../tags";
import { RecoveredExpenseCreditsSchema } from "../transactions/expense-adjustment.schema";
import { MonthSchema } from "./month.schema";

export { type Month, MonthSchema } from "./month.schema";

export const MonthlySummarySchema = z.object({
  month: MonthSchema,
  expectedIncome: ExpectedIncomeTotalsSchema,
  receivedIncome: z.string(),
  unclassifiedCredits: UnclassifiedCreditsSchema,
  spending: z.string(),
  grossSpending: z.string(),
  refunds: z.string(),
  reimbursements: z.string(),
  unresolvedAdjustmentCount: z.number().int().nonnegative(),
  recoveredExpenseCredits: RecoveredExpenseCreditsSchema,
  adjustmentsAsOf: z.iso.datetime(),
  unresolvedMovementCount: z.number().int().nonnegative().optional(),
  tags: z.array(
    TagSummarySchema.extend({
      amount: z.string(),
      count: z.number().int(),
      grossAmount: z.string(),
      refunds: z.string(),
      reimbursements: z.string(),
    }),
  ),
});

export type MonthlySummary = z.infer<typeof MonthlySummarySchema>;
