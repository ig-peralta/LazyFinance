import { z } from "zod";
import { InternalMovementDecisionSchema } from "./internal-movement.schema";
import { RecentTransactionSchema } from "./recent-transaction.schema";

export const TransactionDetailSchema = RecentTransactionSchema.extend(
  InternalMovementDecisionSchema.omit({ id: true }).shape,
).extend({
  source: z.enum(["manual", "provider"]),
  bookedPrecision: z.enum(["instant", "calendar_day"]),
  bookedOn: z.iso.date().nullable(),
  removedAt: z.iso.datetime().nullable(),
  receipt: z.object({ sourceId: z.uuid(), sourceName: z.string() }).nullable(),
  hasExpenseAdjustments: z.boolean(),
});
export type TransactionDetail = z.infer<typeof TransactionDetailSchema>;
