import { z } from "zod";
import { MonthSchema } from "./month.schema";
import { MonthlyComparisonSchema } from "./monthly-comparison.schema";
import { MonthlySummarySchema } from "./monthly-summary.schema";

const amount = z.string();
const nonnegative = z.number().int().nonnegative();

export const MonthlySpendingReadSchema = MonthlySummarySchema.pick({
  month: true,
  spending: true,
  tags: true,
  grossSpending: true,
  refunds: true,
  reimbursements: true,
  unresolvedAdjustmentCount: true,
  recoveredExpenseCredits: true,
  adjustmentsAsOf: true,
  unresolvedMovementCount: true,
}).extend({ asOf: z.iso.datetime(), untaggedSpending: z.string() });

export const MonthlyComparisonReadSchema = MonthlyComparisonSchema.pick({
  month: true,
  previousMonth: true,
  partial: true,
  spending: true,
  receivedIncome: true,
  unresolvedMovementCount: true,
});
const spending = z.object({
  spending: amount,
  grossSpending: amount,
  refunds: amount,
  reimbursements: amount,
  unresolvedAdjustmentCount: nonnegative,
});

export const MonthlyDifferenceSchema = spending.extend({
  month: MonthSchema,
  asOf: z.iso.datetime(),
  adjustmentsAsOf: z.iso.datetime(),
  receivedIncome: amount,
  difference: amount,
  unclassifiedCredits: z.object({ amount, count: nonnegative }),
  unresolvedMovementCount: nonnegative,
  basis: z.literal("confirmed_income_minus_recorded_spending"),
});

export const SpendingRangeInputSchema = z
  .strictObject({
    from: z.iso.date(),
    before: z.iso.date(),
  })
  .refine(({ from, before }) => from < before, "Date range must be ordered");
export const SpendingRangeSchema = spending.extend({
  from: z.iso.date(),
  before: z.iso.date(),
  partial: z.boolean(),
  asOf: z.iso.datetime(),
  adjustmentsAsOf: z.iso.datetime(),
  unresolvedMovementCount: nonnegative,
});

export const SpendingTrendInputSchema = z.strictObject({
  through: MonthSchema.optional(),
  months: z.number().int().min(2).max(12).default(6),
  tagId: z.uuid().nullable().optional(),
});
export const SpendingTrendSchema = z.object({
  through: MonthSchema,
  selection: z.enum(["all", "tag", "untagged"]),
  tagId: z.uuid().nullable(),
  average: amount,
  asOf: z.iso.datetime(),
  months: z
    .array(
      z.object({
        month: MonthSchema,
        spending: amount,
        partial: z.boolean(),
        unresolvedMovementCount: nonnegative,
      }),
    )
    .min(2)
    .max(12),
});

export const SpendingVariationSchema = z.object({
  month: MonthSchema,
  previousMonth: MonthSchema,
  partial: z.boolean(),
  asOf: z.iso.datetime(),
  current: amount,
  previous: amount,
  change: amount,
  rows: z
    .array(
      z.object({
        tagId: z.uuid().nullable(),
        name: z.string(),
        current: amount,
        previous: amount,
        change: amount,
      }),
    )
    .max(12),
  otherChange: amount,
});

export const MerchantSpendingInputSchema = z.strictObject({
  month: MonthSchema.optional(),
  merchant: z.string().trim().min(1).max(120).optional(),
});
const merchantRow = spending
  .pick({
    spending: true,
    grossSpending: true,
    refunds: true,
    reimbursements: true,
  })
  .extend({ merchant: z.string().nullable(), count: nonnegative });
export const MerchantSpendingSchema = z.object({
  month: MonthSchema,
  merchantQuery: z.string().nullable(),
  asOf: z.iso.datetime(),
  totals: merchantRow.omit({ merchant: true }),
  merchants: z.array(merchantRow).max(12),
  otherSpending: amount,
  merchantGroups: nonnegative,
});

export const RecurringCandidatesInputSchema = z.strictObject({
  through: MonthSchema.optional(),
  months: z.number().int().min(3).max(12).default(12),
});
export const RecurringCandidatesSchema = z.object({
  through: MonthSchema,
  months: z.number().int().min(3).max(12),
  asOf: z.iso.datetime(),
  basis: z.literal("observed_merchant_pattern"),
  candidates: z
    .array(
      z.object({
        merchant: z.string(),
        observedMonths: nonnegative,
        total: amount,
        lastObservedMonth: MonthSchema,
      }),
    )
    .max(12),
  hasMore: z.boolean(),
});

export type SpendingRangeInput = z.infer<typeof SpendingRangeInputSchema>;
export type SpendingTrendInput = z.infer<typeof SpendingTrendInputSchema>;
export type MerchantSpendingInput = z.infer<typeof MerchantSpendingInputSchema>;
export type RecurringCandidatesInput = z.infer<
  typeof RecurringCandidatesInputSchema
>;
