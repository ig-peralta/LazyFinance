import type { Generated } from "kysely";

export interface AccountTable {
  id: Generated<string>;
  userId: string;
  providerConnectionId: string;
  externalId: string | null;
  type: "checking" | "savings" | "credit_card";
  number: string | null;
  holderName: string | null;
  holderRut: string | null;
  alias: string | null;
  currency: Generated<"CLP">;
  balance: string | null;
  active: Generated<boolean>;
  lastSyncedAt: Date | null;
  providerObservedAt: Date | null;
  historyCompleteness: Generated<"complete" | "partial" | "unknown">;
  historyFrom: string | null;
  historyThrough: string | null;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export type AccountTables = { "finance.account": AccountTable };
