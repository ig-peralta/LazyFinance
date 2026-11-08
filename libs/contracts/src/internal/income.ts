import { z } from "zod";
import {
  IncomeExpectationInputSchema,
  IncomeExpectationSchema,
} from "../income/income-expectation.schema";
import {
  IncomeSourceInputSchema,
  IncomeSourceSchema,
} from "../income/income-source.schema";
import { MovementAggregatesSchema } from "./transactions";

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
  hasExpenseAdjustments: z.boolean(),
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

export type IncomeSourceRecord = z.infer<typeof IncomeSourceRecordSchema>;

export type IncomeFacts = z.infer<typeof IncomeFactsSchema>;
