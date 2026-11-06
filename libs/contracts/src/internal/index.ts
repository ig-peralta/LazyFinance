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
  tagId: z.uuid().nullable(),
  amount: z.string(),
  count: z.number().int().nonnegative(),
});

export const MovementAggregatesSchema = z
  .array(MovementAggregateSchema)
  .max(50000);

export const TaggedDebitRecordSchema = z.object({
  id: z.uuid(),
  bookedAt: z.iso.datetime(),
  amount: z.string(),
  tagId: z.uuid(),
});

export const TaggedDebitRecordsSchema = z
  .array(TaggedDebitRecordSchema)
  .max(50000);

export const ObjectiveRecordSchema = ObjectiveSummarySchema.omit({
  tags: true,
});

export const ObjectiveRecordsSchema = z.array(ObjectiveRecordSchema).max(10000);

export const ObjectiveIdsInputSchema = z.strictObject({
  ids: z.array(z.uuid()).max(10000),
});

export const ObjectiveTagRecordSchema = TagSummarySchema.extend({
  objectiveId: z.uuid(),
});

export const ObjectiveTagRecordsSchema = z
  .array(ObjectiveTagRecordSchema)
  .max(50000);

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

export const IncomeFactsSchema = z.object({
  sources: z.array(IncomeSourceRecordSchema).max(10000),
  expectations: z.array(IncomeExpectationSchema).max(50000),
  receipts: z.array(ReceiptFactSchema).max(50000),
  aggregates: MovementAggregatesSchema,
});

export type PeriodInput = z.infer<typeof PeriodInputSchema>;

export type IncomeSourceRecord = z.infer<typeof IncomeSourceRecordSchema>;

export type IncomeFacts = z.infer<typeof IncomeFactsSchema>;

export type MovementAggregate = z.infer<typeof MovementAggregateSchema>;

export * from "./provider-sync";
export * from "./tagging";
