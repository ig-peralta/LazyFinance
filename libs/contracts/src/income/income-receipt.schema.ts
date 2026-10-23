import { z } from 'zod';
import { MonthSchema } from '../summaries/month.schema';
import { ExpectedIncomePaymentSchema, ExpectedIncomeTotalsSchema } from './income-expectation.schema';
import { PositiveIncomeAmountSchema } from './income-source.schema';

export const IncomeReceiptInputSchema = z.object({ sourceId: z.uuid() }).strict();

export const IncomeReceiptSchema = z.object({
  transactionId: z.uuid(),
  sourceId: z.uuid(),
  sourceName: z.string(),
  bookedAt: z.iso.datetime(),
  amount: PositiveIncomeAmountSchema,
  confirmedAt: z.iso.datetime(),
});

export const UnclassifiedCreditsSchema = z.object({
  amount: z.string(),
  count: z.number().int().nonnegative(),
});

export const IncomeSummarySchema = z.object({
  month: MonthSchema,
  currency: z.literal('CLP'),
  asOf: z.iso.datetime(),
  expectedIncome: ExpectedIncomeTotalsSchema,
  receivedIncome: z.string(),
  unclassifiedCredits: UnclassifiedCreditsSchema,
  unresolvedMovementCount: z.number().int().nonnegative().optional(),
  expectedPayments: z.array(ExpectedIncomePaymentSchema),
  receipts: z.array(IncomeReceiptSchema),
});

export type IncomeReceipt = z.infer<typeof IncomeReceiptSchema>;
export type IncomeSummary = z.infer<typeof IncomeSummarySchema>;
