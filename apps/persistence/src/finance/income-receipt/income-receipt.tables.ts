import type { Generated } from "kysely";

export interface IncomeReceiptTable {
  transactionId: string;
  sourceId: string;
  confirmedAt: Generated<Date>;
}
export type IncomeReceiptTables = {
  "finance.income_receipt": IncomeReceiptTable;
};
