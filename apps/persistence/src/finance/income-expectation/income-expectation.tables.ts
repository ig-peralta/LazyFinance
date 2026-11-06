import type { Generated } from "kysely";

export interface IncomeExpectationTable {
  id: Generated<string>;
  sourceId: string;
  date: string;
  amount: string;
  isEstimate: Generated<boolean>;
}

export type IncomeExpectationTables = {
  "finance.income_expectation": IncomeExpectationTable;
};
