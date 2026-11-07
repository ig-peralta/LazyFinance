import { z } from "zod";
import { CursorPageInputSchema, cursorPageSchema } from "../pagination";
import { TagSummarySchema } from "../tags/tag-summary.schema";
import { ObjectiveSummarySchema } from "./objective-summary.schema";

const BudgetDateSchema = z.iso.date().regex(/^[1-9]\d{3}-/);

export const BudgetAmountSchema = z
  .string()
  .regex(/^(0|[1-9]\d{0,12})(\.\d{1,2})?$/)
  .refine((value) => !/^0(\.0{1,2})?$/.test(value), "Amount must be positive");

export const BudgetTagIdsSchema = z
  .array(z.uuid())
  .min(1)
  .max(50000)
  .refine((ids) => new Set(ids).size === ids.length, "Duplicate budget tags");

export const BudgetScheduleInputSchema = z.discriminatedUnion("period", [
  z.strictObject({
    period: z.literal("monthly"),
    startDate: BudgetDateSchema.refine(
      (date) => date.endsWith("-01"),
      "Monthly budgets start on the first day of a month",
    ),
  }),
  z.strictObject({
    period: z.literal("yearly"),
    startDate: BudgetDateSchema.refine(
      (date) => date.endsWith("-01-01"),
      "Yearly budgets start on January 1",
    ),
  }),
  z
    .strictObject({
      period: z.literal("fixed"),
      startDate: BudgetDateSchema,
      endDate: BudgetDateSchema,
    })
    .refine((schedule) => schedule.startDate <= schedule.endDate, {
      path: ["endDate"],
      message: "End date must not precede start date",
    }),
]);

const BudgetFieldsSchema = z.strictObject({
  name: z.string().trim().min(1).max(80),
  amount: BudgetAmountSchema,
  tagIds: BudgetTagIdsSchema,
});

export const CreateBudgetInputSchema = BudgetFieldsSchema.extend({
  schedule: BudgetScheduleInputSchema,
});

export const BudgetVersionInputSchema = z.strictObject({
  id: z.uuid(),
  expectedVersion: z.number().int().min(1).max(2147483646),
});

export const UpdateBudgetInputSchema = BudgetVersionInputSchema.extend({
  budget: BudgetFieldsSchema.extend({
    schedule: BudgetScheduleInputSchema.optional(),
  }),
});

// Legacy definitions retain their stored shape; new commands accept only the
// supported schedules above. A stored enum member is not management support.
export const BudgetRevisionSchema = ObjectiveSummarySchema.omit({
  id: true,
  intent: true,
}).extend({
  id: z.uuid(),
  budgetId: z.uuid(),
  version: z.number().int().positive(),
  effectiveFrom: z.iso.datetime(),
  recordedAt: z.iso.datetime(),
  supersededAt: z.iso.datetime().nullable(),
  tags: z.array(TagSummarySchema).max(50000),
});

export const BudgetDetailSchema = z.object({
  id: z.uuid(),
  version: z.number().int().positive(),
  archivedAt: z.iso.datetime().nullable(),
  effective: BudgetRevisionSchema.nullable(),
  pending: BudgetRevisionSchema.nullable(),
});

export const BudgetHistoryInputSchema = CursorPageInputSchema.extend({
  id: z.uuid(),
});

export const BudgetHistoryPageSchema = cursorPageSchema(BudgetRevisionSchema);

export type BudgetScheduleInput = z.infer<typeof BudgetScheduleInputSchema>;
export type CreateBudgetInput = z.infer<typeof CreateBudgetInputSchema>;
export type UpdateBudgetInput = z.infer<typeof UpdateBudgetInputSchema>;
export type BudgetVersionInput = z.infer<typeof BudgetVersionInputSchema>;
export type BudgetRevision = z.infer<typeof BudgetRevisionSchema>;
export type BudgetDetail = z.infer<typeof BudgetDetailSchema>;
export type BudgetHistoryInput = z.infer<typeof BudgetHistoryInputSchema>;
export type BudgetHistoryPage = z.infer<typeof BudgetHistoryPageSchema>;
