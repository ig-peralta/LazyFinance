import type { IncomeSchedule } from "@lazyfinance/contracts";
import type { Generated } from "kysely";

export interface IncomeSourceTable {
  id: Generated<string>;
  userId: string;
  name: string;
  currency: Generated<"CLP">;
  regularity: "regular" | "irregular";
  amountKind: "fixed" | "variable";
  expectedAmount: string | null;
  schedule: IncomeSchedule | null;
  startDate: string;
  endDate: string | null;
  archivedAt: Date | null;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export type IncomeSourceTables = { "finance.income_source": IncomeSourceTable };
