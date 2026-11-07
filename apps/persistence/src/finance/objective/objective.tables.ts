import type { Generated } from "kysely";

export interface ObjectiveTable {
  id: Generated<string>;
  userId: string;
  name: string;
  amount: string;
  kind: "time_based" | "amount_based";
  intent: "spending" | "saving";
  isRecurring: boolean | null;
  period: "daily" | "weekly" | "monthly" | "yearly" | null;
  startDate: Date | null;
  endDate: Date | null;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
  budgetVersion: Generated<number>;
  archivedAt: Date | null;
}

export type ObjectiveTables = { "finance.objective": ObjectiveTable };
