import { z } from "zod";
import { CursorPageInputSchema, cursorPageSchema } from "../pagination";
import { TagSummarySchema } from "../tags/tag-summary.schema";

export const ExpenseAdjustmentAmountSchema = z
  .string()
  .regex(/^(0|[1-9]\d{0,12})(\.\d{1,2})?$/)
  .refine((value) => !/^0(\.0{1,2})?$/.test(value), "Amount must be positive");

export const ExpenseAdjustmentPairSchema = z
  .strictObject({
    creditTransactionId: z.uuid(),
    purchaseTransactionId: z.uuid(),
  })
  .refine(
    (pair) => pair.creditTransactionId !== pair.purchaseTransactionId,
    "A credit cannot adjust itself",
  );

export const SetExpenseAdjustmentSchema =
  ExpenseAdjustmentPairSchema.safeExtend({
    amount: ExpenseAdjustmentAmountSchema,
    kind: z.enum(["refund", "reimbursement"]),
  });

export const ExpenseAdjustmentsInputSchema = CursorPageInputSchema.extend({
  transactionId: z.uuid(),
});

export const ExpenseAdjustmentSchema = z.object({
  id: z.uuid(),
  creditTransactionId: z.uuid(),
  purchaseTransactionId: z.uuid(),
  kind: z.enum(["refund", "reimbursement"]),
  amount: z.string(),
  creditBookedAt: z.iso.datetime(),
  purchaseBookedAt: z.iso.datetime(),
  purchaseTag: TagSummarySchema.nullable(),
  confirmedAt: z.iso.datetime(),
  status: z.enum(["applied", "needs_review"]),
});

export const ExpenseAdjustmentsPageSchema = cursorPageSchema(
  ExpenseAdjustmentSchema,
);

export const RecoveredExpenseCreditsSchema = z.object({
  amount: z.string(),
  count: z.number().int().nonnegative(),
  needsReviewCount: z.number().int().nonnegative(),
});

export type SetExpenseAdjustment = z.infer<typeof SetExpenseAdjustmentSchema>;
export type ExpenseAdjustmentPair = z.infer<typeof ExpenseAdjustmentPairSchema>;
export type ExpenseAdjustmentsInput = z.infer<
  typeof ExpenseAdjustmentsInputSchema
>;
export type ExpenseAdjustment = z.infer<typeof ExpenseAdjustmentSchema>;
