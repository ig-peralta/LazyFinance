import { z } from 'zod';
import { MonthSchema } from '../summaries/month.schema';
import { IncomeDateSchema, PositiveIncomeAmountSchema } from './income-source.schema';

export const IncomeExpectationInputSchema = z.object({
  date: IncomeDateSchema,
  amount: PositiveIncomeAmountSchema,
  isEstimate: z.boolean().default(false),
}).strict();

export const IncomeExpectationSchema = IncomeExpectationInputSchema.extend({
  id: z.uuid(),
  sourceId: z.uuid(),
});

export const ExpectedIncomeTotalsSchema = z.object({
  amount: z.string().describe('Sum of known expected amounts, including the estimated portion'),
  estimatedAmount: z.string().describe('Estimated portion already included in amount'),
  unknownAmountCount: z.number().int().nonnegative(),
  paymentCount: z.number().int().nonnegative(),
});

export const ExpectedIncomePaymentSchema = z.object({
  sourceId: z.uuid(),
  sourceName: z.string(),
  expectationId: z.uuid().nullable(),
  date: IncomeDateSchema,
  amount: PositiveIncomeAmountSchema.nullable(),
  amountType: z.enum(['exact', 'estimated', 'unknown']),
});

export const ExpectedIncomeSchema = z.object({
  month: MonthSchema,
  currency: z.literal('CLP'),
  totals: ExpectedIncomeTotalsSchema,
  payments: z.array(ExpectedIncomePaymentSchema),
});

export type IncomeExpectationInput = z.infer<typeof IncomeExpectationInputSchema>;
export type IncomeExpectation = z.infer<typeof IncomeExpectationSchema>;
export type ExpectedIncomeTotals = z.infer<typeof ExpectedIncomeTotalsSchema>;
export type ExpectedIncomePayment = z.infer<typeof ExpectedIncomePaymentSchema>;
export type ExpectedIncome = z.infer<typeof ExpectedIncomeSchema>;
