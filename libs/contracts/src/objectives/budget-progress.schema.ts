import { z } from "zod";
import { MonthSchema } from "../summaries";

export const BudgetProgressSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  month: MonthSchema,
  period: z.enum(["monthly", "yearly", "fixed"]),
  limit: z.string(),
  spent: z.string(),
  grossSpent: z.string(),
  refunds: z.string(),
  reimbursements: z.string(),
  unresolvedAdjustmentCount: z.number().int().nonnegative(),
  adjustmentsAsOf: z.iso.datetime(),
  remaining: z.string(),
  percentage: z.number().int().nonnegative(),
  revisionId: z.uuid(),
  tracking: z.object({
    start: z.iso.datetime(),
    end: z.iso.datetime(),
    archivedAt: z.iso.datetime().nullable(),
  }),
});

export type BudgetProgress = z.infer<typeof BudgetProgressSchema>;
