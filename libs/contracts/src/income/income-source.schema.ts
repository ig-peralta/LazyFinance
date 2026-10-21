import { z } from 'zod';

export const IncomeDateSchema = z.iso.date().regex(/^[1-9]\d{3}-/);
export const PositiveIncomeAmountSchema = z.string()
  .regex(/^(0|[1-9]\d{0,12})(\.\d{1,2})?$/)
  .refine((value) => !/^0(\.0{1,2})?$/.test(value), 'Amount must be positive');

export const PaymentDaySchema = z.union([z.number().int().min(1).max(31), z.literal('last')]);

export const IncomeScheduleSchema = z.discriminatedUnion('frequency', [
  z.object({
    frequency: z.enum(['weekly', 'every_two_weeks']),
    anchorDate: IncomeDateSchema,
  }).strict(),
  z.object({
    frequency: z.literal('monthly'),
    day: PaymentDaySchema,
  }).strict(),
  z.object({
    frequency: z.literal('twice_monthly'),
    days: z.tuple([PaymentDaySchema, PaymentDaySchema]).refine(([first, second]) =>
      first !== 'last' && first <= 27 && first < (second === 'last' ? 32 : second),
    'Use ordered, distinct days; the first must be 1–27 to avoid short-month collisions'),
  }).strict(),
]);

export const IncomeSourceInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  currency: z.literal('CLP').default('CLP'),
  regularity: z.enum(['regular', 'irregular']),
  amountKind: z.enum(['fixed', 'variable']),
  expectedAmount: PositiveIncomeAmountSchema.nullable().default(null),
  schedule: IncomeScheduleSchema.nullable().default(null),
  startDate: IncomeDateSchema,
  endDate: IncomeDateSchema.nullable().default(null),
}).strict().superRefine((source, ctx) => {
  if (source.amountKind === 'fixed' && source.expectedAmount === null) {
    ctx.addIssue({ code: 'custom', path: ['expectedAmount'], message: 'A fixed amount is required' });
  }
  if ((source.regularity === 'regular') !== (source.schedule !== null)) {
    ctx.addIssue({ code: 'custom', path: ['schedule'], message: 'Only regular income requires a schedule' });
  }
  if (source.endDate !== null && source.endDate < source.startDate) {
    ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'End date must not precede start date' });
  }
});

export const IncomeSourceSchema = IncomeSourceInputSchema.safeExtend({
  id: z.uuid(),
  archivedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type IncomeSchedule = z.infer<typeof IncomeScheduleSchema>;
export type IncomeSourceInput = z.infer<typeof IncomeSourceInputSchema>;
export type IncomeSource = z.infer<typeof IncomeSourceSchema>;
