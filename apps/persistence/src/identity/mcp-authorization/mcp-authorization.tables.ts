import type { Generated } from "kysely";

export interface McpAuthorizationTables {
  "identity.mcp_artifact": {
    model: string;
    key: string;
    ciphertext: string;
    grantId: string | null;
    accountId: string | null;
    clientId: string | null;
    uidHash: string | null;
    expiresAt: Date | null;
    consumedAt: Generated<Date | null>;
  };
  "identity.mcp_grant": {
    id: string;
    interactionId: string;
    userId: string;
    clientId: string;
    clientName: string;
    redirectUri: string | null;
    resource: string;
    scopes: string[];
    createdAt: Generated<Date>;
    expiresAt: Generated<Date>;
    revokedAt: Generated<Date | null>;
  };
}
