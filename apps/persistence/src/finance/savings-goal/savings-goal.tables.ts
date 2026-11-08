import type { Generated } from "kysely";
import type { ObjectiveTable } from "../objective/objective.tables";

export type SavingsRevisionTable = Pick<
  ObjectiveTable,
  | "name"
  | "amount"
  | "kind"
  | "isRecurring"
  | "period"
  | "startDate"
  | "endDate"
> & {
  id: Generated<string>;
  objectiveId: string;
  version: number;
  recordedAt: Generated<Date>;
};
export type SavingsGoalTables = {
  "finance.savings_revision": SavingsRevisionTable;
  "finance.savings_revision_tag": { revisionId: string; tagId: string };
};
