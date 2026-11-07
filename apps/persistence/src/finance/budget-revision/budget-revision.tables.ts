import type { Generated } from "kysely";
import type { ObjectiveTable } from "../objective/objective.tables";

export interface BudgetRevisionTable {
  id: Generated<string>;
  objectiveId: string;
  version: number;
  name: string;
  amount: string;
  kind: ObjectiveTable["kind"];
  isRecurring: boolean | null;
  period: ObjectiveTable["period"];
  startDate: Date | null;
  endDate: Date | null;
  effectiveFrom: Date;
  recordedAt: Generated<Date>;
  supersededAt: Date | null;
}

export type BudgetRevisionTables = {
  "finance.budget_revision": BudgetRevisionTable;
};
