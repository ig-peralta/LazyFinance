import type { Generated } from "kysely";

export interface ExpenseAdjustmentTable {
  id: Generated<string>;
  creditTransactionId: string;
  purchaseTransactionId: string;
  kind: "refund" | "reimbursement";
  amount: string;
  creditAmount: string;
  purchaseAmount: string;
  creditBookedAt: Date;
  purchaseBookedAt: Date;
  confirmedAt: Generated<Date>;
}

export type ExpenseAdjustmentTables = {
  "finance.expense_adjustment": ExpenseAdjustmentTable;
};
