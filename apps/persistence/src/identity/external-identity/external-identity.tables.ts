import type { Generated } from "kysely";

export interface ExternalIdentityTable {
  provider: string;
  issuer: string;
  providerSubject: string;
  userId: string;
  createdAt: Generated<Date>;
}

export type ExternalIdentityTables = {
  "identity.external_identity": ExternalIdentityTable;
};
