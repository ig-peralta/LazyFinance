import type { Generated } from "kysely";

export interface TagRuleTable {
  id: Generated<string>;
  userId: string;
  tagId: string;
  accountId: string | null;
  direction: "debit" | "credit";
  matchField: "merchant" | "description";
  matchValue: string;
  priority: Generated<number>;
  mode: Generated<"suggest" | "auto">;
  approvedAt: Date | null;
  active: Generated<boolean>;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}
export type TagRuleTables = { "finance.tag_rule": TagRuleTable };
