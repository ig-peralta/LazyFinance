import type { Generated } from "kysely";

export interface ProviderLinkIntentTable {
  id: string;
  userId: string;
  providerIntentId: string;
  mode: "test" | "live";
  holderType: "individual" | "business";
  connectionId: string | null;
  expectedVersion: number | null;
  state: Generated<"pending" | "processing" | "completed" | "failed">;
  exchangeTokenHash: string | null;
  completedConnectionId: string | null;
  createdAt: Generated<Date>;
  expiresAt: Generated<Date>;
}

export type ProviderLinkTables = {
  "finance.provider_link_intent": ProviderLinkIntentTable;
};
