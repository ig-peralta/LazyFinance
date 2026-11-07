import { z } from "zod";

export const EmptyInputSchema = z.void();

export const VoidResultSchema = z.void();

export const IdInputSchema = z.strictObject({ id: z.uuid() });

export const AtIdInputSchema = z.strictObject({
  id: z.uuid(),
  at: z.iso.datetime(),
});

export const LocalTimestampSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);

export const PeriodInputSchema = z.strictObject({
  start: LocalTimestampSchema,
  end: LocalTimestampSchema,
  asOf: z.iso.datetime().optional(),
});

export type PeriodInput = z.infer<typeof PeriodInputSchema>;
