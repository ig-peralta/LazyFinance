import type { Generated } from "kysely";

export interface ProviderConnectionTable {
  id: Generated<string>;
  userId: string;
  providerId: string;
  metadata: Generated<Record<string, unknown>>;
  status: Generated<"active" | "revoked" | "expired">;
  mode: "test" | "live" | null;
  externalId: string | null;
  encryptedCredential: string | null;
  credentialVersion: Generated<number>;
  holderType: "individual" | "business" | null;
  institutionId: string | null;
  institutionName: string | null;
  disconnectedAt: Date | null;
  disconnectPending: Generated<boolean>;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export type ProviderConnectionTables = {
  "finance.provider_connection": ProviderConnectionTable;
};
