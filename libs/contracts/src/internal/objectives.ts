import { z } from "zod";
import {
  BudgetAmountSchema,
  BudgetTagIdsSchema,
  BudgetVersionInputSchema,
} from "../objectives/budget-management.schema";
import { ObjectiveSummarySchema } from "../objectives/objective-summary.schema";
import { TagSummarySchema } from "../tags/tag-summary.schema";
import { LocalTimestampSchema } from "./common";

export const ObjectiveRecordSchema = ObjectiveSummarySchema.extend({
  tags: z.array(TagSummarySchema).max(50000),
});

export const ObjectiveRecordsSchema = z.array(ObjectiveRecordSchema).max(10000);

// ISO values preserve legacy instants; local values are API-computed Santiago
// boundaries, converted to instants by persistence without calendar arithmetic.
export const BudgetBoundarySchema = z.union([
  LocalTimestampSchema,
  z.iso.datetime(),
]);

export const BudgetPeriodInputSchema = z.strictObject({
  before: LocalTimestampSchema,
  id: z.uuid().optional(),
});

export const BudgetPeriodRecordSchema = ObjectiveRecordSchema.extend({
  revisionId: z.uuid(),
  archivedAt: z.iso.datetime().nullable(),
});

export const BudgetPeriodRecordsSchema = z
  .array(BudgetPeriodRecordSchema)
  .max(10000);

export const BudgetWriteDefinitionSchema = z
  .strictObject({
    name: z.string().trim().min(1).max(80),
    amount: BudgetAmountSchema,
    tagIds: BudgetTagIdsSchema,
    isRecurring: z.boolean(),
    period: z.enum(["monthly", "yearly"]).nullable(),
    startDate: BudgetBoundarySchema,
    endDate: BudgetBoundarySchema.nullable(),
  })
  .refine(
    (budget) =>
      budget.isRecurring
        ? budget.period !== null
        : budget.period === null && budget.endDate !== null,
    "Unsupported budget configuration",
  );

export const CreateBudgetCommandSchema = z.strictObject({
  budget: BudgetWriteDefinitionSchema,
});

export const UpdateBudgetCommandSchema = BudgetVersionInputSchema.extend({
  budget: BudgetWriteDefinitionSchema,
  effectiveFrom: BudgetBoundarySchema,
  wasStarted: z.boolean(),
});

function comparableBoundary(value: string) {
  const [whole, fraction = ""] = value
    .replace(/Z$/, "")
    .replace("T", " ")
    .split(".");
  return `${whole}.${fraction.padEnd(6, "0")}`;
}

export const ObjectiveSpendingInputSchema = z.strictObject({
  windows: z
    .array(
      z
        .strictObject({
          id: z.uuid(),
          revisionId: z.uuid(),
          start: BudgetBoundarySchema,
          end: BudgetBoundarySchema,
        })
        .refine(
          (window) =>
            window.start.includes("T") !== window.end.includes("T") ||
            comparableBoundary(window.start) < comparableBoundary(window.end),
          "Empty budget window",
        ),
    )
    .min(1)
    .max(10000)
    .refine(
      (windows) => new Set(windows.map(({ id }) => id)).size === windows.length,
      "Duplicate budget windows",
    ),
  asOf: z.iso.datetime().optional(),
  adjustmentsAsOf: z.iso.datetime().optional(),
});

export const ObjectiveSpendingFactsSchema = z
  .array(
    z.object({
      id: z.uuid(),
      revisionId: z.uuid(),
      amount: z.string(),
      count: z.number().int().nonnegative(),
      refundAmount: z.string(),
      reimbursementAmount: z.string(),
      adjustmentReviewCount: z.number().int().nonnegative(),
      start: z.iso.datetime(),
      end: z.iso.datetime(),
      archivedAt: z.iso.datetime().nullable(),
    }),
  )
  .max(10000);

export type ObjectiveSpendingInput = z.infer<
  typeof ObjectiveSpendingInputSchema
>;
export type BudgetWriteDefinition = z.infer<typeof BudgetWriteDefinitionSchema>;
export type CreateBudgetCommand = z.infer<typeof CreateBudgetCommandSchema>;
export type UpdateBudgetCommand = z.infer<typeof UpdateBudgetCommandSchema>;
export type BudgetPeriodRecord = z.infer<typeof BudgetPeriodRecordSchema>;
