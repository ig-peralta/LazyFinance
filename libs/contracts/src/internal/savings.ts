import { z } from "zod";
import { BudgetAmountSchema } from "../objectives/budget-management.schema";
import {
  SavingsEvidenceRecordSchema,
  SavingsHistoryCoverageSchema,
  SavingsTrackingSchema,
} from "../objectives/savings-progress.schema";
import { CursorPageInputSchema, cursorPageSchema } from "../pagination";
import { BudgetBoundarySchema } from "./objectives";

export const SavingsWriteDefinitionSchema = z
  .strictObject({
    name: z.string().trim().min(1).max(80),
    amount: BudgetAmountSchema,
    tagIds: z
      .array(z.uuid())
      .min(1)
      .max(50000)
      .refine((ids) => new Set(ids).size === ids.length),
    kind: z.enum(["amount_based", "time_based"]),
    isRecurring: z.boolean().nullable(),
    period: z.enum(["monthly", "yearly"]).nullable(),
    startDate: BudgetBoundarySchema.nullable(),
    endDate: BudgetBoundarySchema.nullable(),
  })
  .refine((goal) =>
    goal.kind === "amount_based"
      ? goal.isRecurring === null &&
        goal.period === null &&
        goal.startDate === null &&
        goal.endDate === null
      : goal.startDate !== null &&
        (goal.isRecurring === true
          ? goal.period !== null
          : goal.isRecurring === false &&
            goal.period === null &&
            goal.endDate !== null),
  );
export const CreateSavingsCommandSchema = z.strictObject({
  goal: SavingsWriteDefinitionSchema,
});
export const UpdateSavingsCommandSchema = CreateSavingsCommandSchema.extend({
  id: z.uuid(),
  expectedVersion: z.number().int().min(1).max(2147483646),
});
export type SavingsWriteDefinition = z.infer<
  typeof SavingsWriteDefinitionSchema
>;
export type CreateSavingsCommand = z.infer<typeof CreateSavingsCommandSchema>;
export type UpdateSavingsCommand = z.infer<typeof UpdateSavingsCommandSchema>;

export const SavingsReadSchema = z.strictObject({
  id: z.uuid(),
  expectedVersion: z.number().int().positive(),
  start: BudgetBoundarySchema.nullable(),
  end: BudgetBoundarySchema,
  asOf: z.iso.datetime(),
});
export const SavingsEvidenceReadSchema = SavingsReadSchema.extend(
  CursorPageInputSchema.shape,
);
export const SavingsGroupsSchema = z
  .array(
    z.object({
      accountType: z.enum(["checking", "savings"]),
      type: z.enum(["debit", "credit"]),
      reviewStatus: z.enum(["clear", "needs_review"]),
      amount: z.string(),
      count: z.number().int().nonnegative(),
    }),
  )
  .max(8);
export const SavingsFactsSchema = z.object({
  groups: SavingsGroupsSchema,
  tracking: SavingsTrackingSchema,
  historyCoverage: SavingsHistoryCoverageSchema,
});
export const SavingsEvidenceRecordsSchema = cursorPageSchema(
  SavingsEvidenceRecordSchema,
).extend({
  tracking: SavingsTrackingSchema,
  goalVersion: z.number().int().positive(),
});
export type SavingsRead = z.infer<typeof SavingsReadSchema>;
export type SavingsEvidenceRead = z.infer<typeof SavingsEvidenceReadSchema>;
