import type { Generated } from "kysely";

export interface TagDecisionEventTable {
  id: Generated<string>;
  userId: string;
  transactionId: string;
  previousTagId: string | null;
  tagId: string | null;
  ruleId: string | null;
  kind:
    | "manual_tag"
    | "manual_no_tag"
    | "reset"
    | "rule_applied"
    | "rule_revalidated";
  createdAt: Generated<Date>;
}
export type TagDecisionEventTables = {
  "finance.tag_decision_event": TagDecisionEventTable;
};
