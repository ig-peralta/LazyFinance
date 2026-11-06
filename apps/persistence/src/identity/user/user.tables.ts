import type { Generated } from "kysely";

export interface UserTable {
  id: Generated<string>;
  email: string;
  name: string;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export type UserTables = { "identity.user": UserTable };
