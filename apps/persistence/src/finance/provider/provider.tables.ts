import type { Generated } from "kysely";

export interface ProviderTable {
  id: Generated<string>;
  identifier: string;
  createdAt: Generated<Date>;
}
export type ProviderTables = { "finance.provider": ProviderTable };
