import { z } from "zod";
import { CursorPageInputSchema, cursorPageSchema } from "../pagination";
import { SpendingEvidenceTrackingSchema } from "../transactions/spending-contributions.schema";
import { PeriodInputSchema } from "./common";
import { ObjectiveSpendingInputSchema } from "./objectives";
import { RecentTransactionRecordSchema } from "./transactions";

export const SummarySpendingEvidenceInputSchema = PeriodInputSchema.extend(
  CursorPageInputSchema.shape,
).extend({
  tagId: z.uuid().nullable().optional(),
  asOf: z.iso.datetime(),
  adjustmentsAsOf: z.iso.datetime(),
});
export const BudgetSpendingEvidenceInputSchema = CursorPageInputSchema.extend({
  window: ObjectiveSpendingInputSchema.shape.windows.element,
  asOf: z.iso.datetime(),
  adjustmentsAsOf: z.iso.datetime(),
});
export const SpendingAggregateFactSchema = z.object({
  amount: z.string(),
  count: z.number().int().nonnegative(),
  refundAmount: z.string(),
  reimbursementAmount: z.string(),
  adjustmentReviewCount: z.number().int().nonnegative(),
});
export const SpendingEvidenceRecordSchema =
  RecentTransactionRecordSchema.extend(
    SpendingAggregateFactSchema.omit({ amount: true, count: true }).shape,
  );
export const SpendingEvidenceFactsSchema = cursorPageSchema(
  SpendingEvidenceRecordSchema,
).extend({
  totals: SpendingAggregateFactSchema,
  untagged: SpendingAggregateFactSchema,
  tracking: SpendingEvidenceTrackingSchema,
});
export type SummarySpendingEvidenceInput = z.infer<
  typeof SummarySpendingEvidenceInputSchema
>;
export type BudgetSpendingEvidenceInput = z.infer<
  typeof BudgetSpendingEvidenceInputSchema
>;
export type SpendingAggregateFact = z.infer<typeof SpendingAggregateFactSchema>;
export type SpendingEvidenceRecord = z.infer<
  typeof SpendingEvidenceRecordSchema
>;
export type SpendingEvidenceFacts = z.infer<typeof SpendingEvidenceFactsSchema>;
