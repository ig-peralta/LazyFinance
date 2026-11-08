import { z } from "zod";
import { CursorPageInputSchema, cursorPageSchema } from "../pagination";
import {
  BudgetAmountSchema,
  BudgetScheduleInputSchema,
  BudgetVersionInputSchema,
} from "./budget-management.schema";
import { ObjectiveSummarySchema } from "./objective-summary.schema";

export const SavingsScheduleSchema = z.union([
  z.strictObject({ period: z.literal("lifetime") }),
  BudgetScheduleInputSchema,
]);

const SavingsFieldsSchema = z.strictObject({
  name: z.string().trim().min(1).max(80),
  amount: BudgetAmountSchema,
  tagIds: z
    .array(z.uuid())
    .min(1)
    .max(50000)
    .refine((ids) => new Set(ids).size === ids.length, "Duplicate goal tags"),
  schedule: SavingsScheduleSchema,
});

export const CreateSavingsGoalSchema = SavingsFieldsSchema;
export const SavingsGoalVersionSchema = BudgetVersionInputSchema;
export const UpdateSavingsGoalSchema = SavingsGoalVersionSchema.extend({
  goal: SavingsFieldsSchema,
});
export const SavingsGoalSchema = ObjectiveSummarySchema.extend({
  intent: z.literal("saving"),
  version: z.number().int().positive(),
  revisionId: z.uuid(),
  archivedAt: z.iso.datetime().nullable(),
});
export const SavingsRevisionSchema = ObjectiveSummarySchema.omit({
  id: true,
  intent: true,
}).extend({
  id: z.uuid(),
  goalId: z.uuid(),
  version: z.number().int().positive(),
  recordedAt: z.iso.datetime(),
});
export const SavingsHistoryInputSchema = CursorPageInputSchema.extend({
  id: z.uuid(),
});
export const SavingsHistoryPageSchema = cursorPageSchema(SavingsRevisionSchema);

export type CreateSavingsGoal = z.infer<typeof CreateSavingsGoalSchema>;
export type UpdateSavingsGoal = z.infer<typeof UpdateSavingsGoalSchema>;
export type SavingsGoalVersion = z.infer<typeof SavingsGoalVersionSchema>;
export type SavingsGoal = z.infer<typeof SavingsGoalSchema>;
export type SavingsRevision = z.infer<typeof SavingsRevisionSchema>;
export type SavingsHistoryInput = z.infer<typeof SavingsHistoryInputSchema>;
