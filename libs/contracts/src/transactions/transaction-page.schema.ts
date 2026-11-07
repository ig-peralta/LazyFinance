import { z } from "zod";
import { CursorPageInputSchema, cursorPageSchema } from "../pagination";
import { RecentTransactionSchema } from "./recent-transaction.schema";

export const TransactionsInputSchema = CursorPageInputSchema.extend({
  accountId: z.uuid().optional(),
});

export const TransactionsPageSchema = cursorPageSchema(RecentTransactionSchema);

export type TransactionsInput = z.infer<typeof TransactionsInputSchema>;
export type TransactionsPage = z.infer<typeof TransactionsPageSchema>;
