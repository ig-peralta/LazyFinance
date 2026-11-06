import type { Generated } from "kysely";

export interface TagTable {
  id: Generated<string>;
  userId: string;
  name: string;
  color: string | null;
  isArchived: Generated<boolean>;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export type TagTables = { "finance.tag": TagTable };
