import { z } from "zod";
import { CursorPageInputSchema, cursorPageSchema } from "../pagination";
import { MonthSchema } from "../summaries/month.schema";
import { RecentTransactionSchema } from "../transactions/recent-transaction.schema";
import { SavingsGoalSchema } from "./savings-goal.schema";

export const SavingsProgressInputSchema = z.strictObject({
  id: z.uuid(),
  month: MonthSchema.optional(),
  asOf: z.iso.datetime().optional(),
});
export const SavingsEvidenceInputSchema = SavingsProgressInputSchema.extend(
  CursorPageInputSchema.shape,
);
export const SavingsEffectSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("applied"),
    kind: z.enum(["contribution", "withdrawal"]),
    amount: z.string(),
  }),
  z.object({
    status: z.literal("pending"),
    reason: z.literal("movement_review"),
  }),
  z.object({
    status: z.literal("excluded"),
    reason: z.enum([
      "unselected_tag",
      "non_cash_account",
      "removed",
      "outside_window",
    ]),
  }),
]);
export const SavingsTrackingSchema = z.object({
  start: z.string().nullable(),
  end: z.string(),
  asOf: z.iso.datetime(),
  archivedAt: z.iso.datetime().nullable(),
  empty: z.boolean(),
});
export const SavingsHistoryCoverageSchema = z
  .array(
    z.object({
      accountId: z.uuid(),
      completeness: z.enum(["complete", "partial", "unknown"]),
      from: z.iso.date().nullable(),
      through: z.iso.date().nullable(),
    }),
  )
  .max(10000);
export const SavingsProgressSchema = z.object({
  goal: SavingsGoalSchema,
  month: MonthSchema,
  period: z.enum(["cumulative", "monthly", "yearly", "fixed"]),
  basis: z.literal("recorded_allocations"),
  tracking: SavingsTrackingSchema,
  contributions: z.string(),
  withdrawals: z.string(),
  netContributions: z.string(),
  remaining: z.string(),
  percentage: z.string(),
  contributionCount: z.number().int().nonnegative(),
  withdrawalCount: z.number().int().nonnegative(),
  pendingCount: z.number().int().nonnegative(),
  historyCoverage: SavingsHistoryCoverageSchema,
});
export const SavingsEvidenceRecordSchema = RecentTransactionSchema.omit({
  account: true,
  tagDecisionOrigin: true,
  tagRuleId: true,
}).extend({
  accountId: z.uuid(),
  accountType: z.enum(["checking", "savings", "credit_card"]),
});
export const SavingsEvidenceSchema = SavingsEvidenceRecordSchema.extend({
  effect: SavingsEffectSchema,
});
export const SavingsEvidencePageSchema = cursorPageSchema(
  SavingsEvidenceSchema,
).extend({
  tracking: SavingsTrackingSchema,
  goalVersion: z.number().int().positive(),
});
export type SavingsProgressInput = z.infer<typeof SavingsProgressInputSchema>;
export type SavingsEvidenceInput = z.infer<typeof SavingsEvidenceInputSchema>;
export type SavingsEffect = z.infer<typeof SavingsEffectSchema>;
