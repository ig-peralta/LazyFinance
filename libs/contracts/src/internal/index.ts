import { z } from "zod";
import { AccountSummarySchema } from "../accounts/account-summary.schema";
import {
  IncomeExpectationInputSchema,
  IncomeExpectationSchema,
} from "../income/income-expectation.schema";
import {
  IncomeSourceInputSchema,
  IncomeSourceSchema,
} from "../income/income-source.schema";
import { ObjectiveSummarySchema } from "../objectives/objective-summary.schema";
import { TagSummarySchema } from "../tags/tag-summary.schema";
import { RecentTransactionSchema } from "../transactions/recent-transaction.schema";

export const EmptyInputSchema = z.void();
export const AccountRecordsSchema = z.array(AccountSummarySchema);

export const IdentityResolutionInputSchema = z.strictObject({
  mode: z.enum(["existing", "provision"]),
});

export const IdInputSchema = z.strictObject({ id: z.uuid() });

export const LocalTimestampSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);

export const PeriodInputSchema = z.strictObject({
  start: LocalTimestampSchema,
  end: LocalTimestampSchema,
  asOf: z.iso.datetime().optional(),
});

export const RecentTransactionRecordSchema = RecentTransactionSchema.omit({
  account: true,
}).extend({
  accountId: z.uuid(),
  accountAlias: z.string().nullable(),
  accountType: z.enum(["checking", "savings", "credit_card"]),
  currency: z.literal("CLP"),
});

export const RecentTransactionRecordsSchema = z
  .array(RecentTransactionRecordSchema)
  .max(10);

export const MovementAggregateSchema = z.object({
  type: z.enum(["debit", "credit"]),
  isInternalMovement: z.boolean().nullable(),
  reviewStatus: z.enum(["clear", "needs_review"]),
  hasReceipt: z.boolean(),
  amount: z.string(),
  count: z.number().int().nonnegative(),
});

// 2 directions × 3 internal states × 2 review states × 2 receipt states.
export const MovementAggregatesSchema = z
  .array(MovementAggregateSchema)
  .max(24);

export const TaggedMovementAggregateSchema = MovementAggregateSchema.extend({
  tag: TagSummarySchema.nullable(),
});

export const TaggedMovementAggregatesSchema = z
  .array(TaggedMovementAggregateSchema)
  .max(50000);

export const ObjectiveRecordSchema = ObjectiveSummarySchema.extend({
  tags: z.array(TagSummarySchema).max(50000),
});

export const ObjectiveRecordsSchema = z.array(ObjectiveRecordSchema).max(10000);

export const ObjectiveSpendingInputSchema = z.strictObject({
  windows: z
    .array(
      z
        .strictObject({
          id: z.uuid(),
          start: LocalTimestampSchema,
          end: LocalTimestampSchema,
        })
        .refine((window) => window.start < window.end, "Empty budget window"),
    )
    .min(1)
    .max(10000)
    .refine(
      (windows) => new Set(windows.map(({ id }) => id)).size === windows.length,
      "Duplicate budget windows",
    ),
  asOf: z.iso.datetime().optional(),
});

export const ObjectiveSpendingFactsSchema = z
  .array(
    z.object({
      id: z.uuid(),
      amount: z.string(),
      count: z.number().int().nonnegative(),
    }),
  )
  .max(10000);

export const TagRecordSchema = TagSummarySchema.extend({
  isArchived: z.boolean(),
});

export const TagRecordsSchema = z.array(TagRecordSchema).max(10000);

export const IncomeSourceRecordSchema = IncomeSourceSchema.safeExtend({
  userId: z.uuid(),
});

export const IncomeSourceRecordsSchema = z
  .array(IncomeSourceRecordSchema)
  .max(10000);

export const IncomeSourceCreateSchema = IncomeSourceInputSchema;

export const IncomeSourceUpdateSchema = z.strictObject({
  id: z.uuid(),
  source: IncomeSourceInputSchema,
});

export const AtIdInputSchema = z.strictObject({
  id: z.uuid(),
  at: z.iso.datetime(),
});

export const ExpectationCreateSchema = z.strictObject({
  sourceId: z.uuid(),
  expectation: IncomeExpectationInputSchema,
});

export const ExpectationUpdateSchema = z.strictObject({
  id: z.uuid(),
  expectation: IncomeExpectationInputSchema,
});

export const ExpectationRecordsSchema = z
  .array(IncomeExpectationSchema)
  .max(50000);

export const ExpectationRecordSchema = IncomeExpectationSchema;
export const VoidResultSchema = z.void();

export const ReceiptConfirmSchema = z.strictObject({
  transactionId: z.uuid(),
  sourceId: z.uuid(),
  at: z.iso.datetime(),
});

export const ReceiptFactSchema = z.object({
  transactionId: z.uuid(),
  sourceId: z.uuid(),
  sourceName: z.string(),
  bookedAt: z.iso.datetime(),
  amount: z.string(),
  confirmedAt: z.iso.datetime(),
  type: z.enum(["debit", "credit"]),
  isInternalMovement: z.boolean().nullable(),
  reviewStatus: z.enum(["clear", "needs_review"]),
  removedAt: z.iso.datetime().nullable(),
});

export const ExpectedIncomeFactsSchema = z.object({
  sources: z.array(IncomeSourceRecordSchema).max(10000),
  expectations: z.array(IncomeExpectationSchema).max(50000),
});

export const ReceiptFactsSchema = z.array(ReceiptFactSchema).max(50000);

export const IncomeFactsSchema = ExpectedIncomeFactsSchema.extend({
  receipts: ReceiptFactsSchema,
  aggregates: MovementAggregatesSchema,
});

export type PeriodInput = z.infer<typeof PeriodInputSchema>;

export type IncomeSourceRecord = z.infer<typeof IncomeSourceRecordSchema>;

export type IncomeFacts = z.infer<typeof IncomeFactsSchema>;

export type MovementAggregate = z.infer<typeof MovementAggregateSchema>;

export type TaggedMovementAggregate = z.infer<
  typeof TaggedMovementAggregateSchema
>;

export type ObjectiveSpendingInput = z.infer<
  typeof ObjectiveSpendingInputSchema
>;

export * from "./provider-sync";
export * from "./tagging";
