import { z } from "zod";
import { CursorPageInputSchema, cursorPageSchema } from "../pagination";
import { MonthSchema } from "../summaries/month.schema";
import { RecentTransactionSchema } from "./recent-transaction.schema";

export const SpendingContributionsInputSchema = CursorPageInputSchema.extend({
  month: MonthSchema.optional(),
  tagId: z.uuid().nullable().optional(),
  asOf: z.iso.datetime().optional(),
  adjustmentsAsOf: z.iso.datetime().optional(),
});
export const BudgetContributionsInputSchema =
  SpendingContributionsInputSchema.omit({ tagId: true }).extend({
    id: z.uuid(),
    revisionId: z.uuid(),
  });
export const SpendingAmountsSchema = z.object({
  grossSpending: z.string(),
  refunds: z.string(),
  reimbursements: z.string(),
  spending: z.string(),
  unresolvedAdjustmentCount: z.number().int().nonnegative(),
});
export const SpendingTotalsSchema = SpendingAmountsSchema.extend({
  count: z.number().int().nonnegative(),
});
export const SpendingContributionSchema = RecentTransactionSchema.extend(
  SpendingAmountsSchema.shape,
);
export const SpendingEvidenceTrackingSchema = z.object({
  start: z.iso.datetime(),
  end: z.iso.datetime(),
  asOf: z.iso.datetime(),
  adjustmentsAsOf: z.iso.datetime(),
  archivedAt: z.iso.datetime().nullable(),
  revisionId: z.uuid().nullable(),
});
export const SpendingContributionsPageSchema = cursorPageSchema(
  SpendingContributionSchema,
).extend({
  month: MonthSchema,
  basis: z.literal("purchase_attribution"),
  tracking: SpendingEvidenceTrackingSchema,
  totals: SpendingTotalsSchema,
  untaggedInSelection: SpendingTotalsSchema,
  includesUntagged: z.boolean(),
});
export type SpendingContributionsInput = z.infer<
  typeof SpendingContributionsInputSchema
>;
export type BudgetContributionsInput = z.infer<
  typeof BudgetContributionsInputSchema
>;
