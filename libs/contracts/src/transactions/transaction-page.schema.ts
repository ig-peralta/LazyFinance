import { z } from "zod";
import { CursorPageInputSchema, cursorPageSchema } from "../pagination";
import { RecentTransactionSchema } from "./recent-transaction.schema";

export const TransactionsInputSchema = CursorPageInputSchema.extend({
  accountId: z.uuid().optional(),
  bookedFrom: z.iso
    .date()
    .regex(/^[1-9]\d{3}-/)
    .optional(),
  bookedBefore: z.iso
    .date()
    .regex(/^[1-9]\d{3}-/)
    .optional(),
  tagId: z.uuid().nullable().optional(),
  type: z.enum(["debit", "credit"]).optional(),
  isInternalMovement: z.boolean().nullable().optional(),
  merchant: z.string().trim().min(1).max(120).optional(),
}).refine(
  (input) =>
    !input.bookedFrom ||
    !input.bookedBefore ||
    input.bookedFrom < input.bookedBefore,
  "Date range must be nonempty and ordered",
);

export const TransactionsPageSchema = cursorPageSchema(RecentTransactionSchema);

export type TransactionsInput = z.infer<typeof TransactionsInputSchema>;
export type TransactionsPage = z.infer<typeof TransactionsPageSchema>;
