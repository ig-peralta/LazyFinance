import { sql } from "kysely";
import type { MigrationDatabase } from "../../migration-helpers";

export async function up(db: MigrationDatabase) {
  await sql`CREATE TABLE identity.mcp_grant (
    id text PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 256),
    interaction_id text NOT NULL UNIQUE CHECK (length(interaction_id) BETWEEN 1 AND 256),
    user_id uuid NOT NULL REFERENCES identity."user"(id),
    client_id text NOT NULL CHECK (length(client_id) BETWEEN 1 AND 2048),
    client_name text NOT NULL CHECK (length(client_name) BETWEEN 1 AND 200),
    resource text NOT NULL CHECK (length(resource) BETWEEN 1 AND 2048),
    scopes text[] NOT NULL CHECK (cardinality(scopes) BETWEEN 1 AND 7 AND scopes <@ ARRAY['finance:read','openid','offline_access','finance:budgets:write','finance:goals:write','finance:tags:write','finance:movements:tag']::text[] AND 'finance:read' = ANY(scopes)),
    created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
    expires_at timestamptz NOT NULL DEFAULT (statement_timestamp() + interval '2592000 seconds'),
    revoked_at timestamptz,
    CHECK (expires_at > created_at AND expires_at <= created_at + interval '2592000 seconds')
  );
  CREATE FUNCTION identity.keep_mcp_revocation() RETURNS trigger
    LANGUAGE plpgsql SET search_path = pg_catalog AS $$
    BEGIN
      IF OLD.revoked_at IS NOT NULL THEN NEW.revoked_at := OLD.revoked_at; END IF;
      RETURN NEW;
    END $$;
  CREATE TRIGGER keep_mcp_revocation BEFORE UPDATE ON identity.mcp_grant
    FOR EACH ROW EXECUTE FUNCTION identity.keep_mcp_revocation();
  CREATE INDEX mcp_grant_owner ON identity.mcp_grant(user_id, created_at DESC);
  ALTER TABLE identity.mcp_grant ENABLE ROW LEVEL SECURITY;
  ALTER TABLE identity.mcp_grant FORCE ROW LEVEL SECURITY;
  CREATE POLICY grant_read ON identity.mcp_grant FOR SELECT TO lazyfinance_runtime
    USING (user_id = (SELECT identity.current_user_id()) OR current_setting('lazyfinance.context_kind', true) = 'mcp-authorization');
  CREATE POLICY grant_insert ON identity.mcp_grant FOR INSERT TO lazyfinance_runtime
    WITH CHECK (user_id = (SELECT identity.current_user_id()));
  CREATE POLICY grant_revoke ON identity.mcp_grant FOR UPDATE TO lazyfinance_runtime
    USING (user_id = (SELECT identity.current_user_id()) OR current_setting('lazyfinance.context_kind', true) = 'mcp-authorization')
    WITH CHECK (user_id = (SELECT identity.current_user_id()) OR current_setting('lazyfinance.context_kind', true) = 'mcp-authorization');
  GRANT SELECT, INSERT ON identity.mcp_grant TO lazyfinance_runtime;
  GRANT UPDATE (revoked_at) ON identity.mcp_grant TO lazyfinance_runtime;

  CREATE TABLE identity.mcp_artifact (
    model text NOT NULL CHECK (model IN ('AccessToken','AuthorizationCode','Client','Grant','Interaction','RefreshToken','ReplayDetection','Session','RegistrationAccessToken')),
    key text NOT NULL CHECK (key ~ '^[a-f0-9]{64}$'),
    ciphertext text NOT NULL CHECK (octet_length(ciphertext) <= 350000),
    grant_id text,
    account_id uuid REFERENCES identity."user"(id),
    client_id text,
    uid_hash text CHECK (uid_hash ~ '^[a-f0-9]{64}$'),
    expires_at timestamptz,
    consumed_at timestamptz,
    CHECK ((expires_at IS NULL) = (model = 'Client')),
    PRIMARY KEY (model, key)
  );
  CREATE INDEX mcp_artifact_grant ON identity.mcp_artifact(grant_id);
  CREATE INDEX mcp_artifact_uid ON identity.mcp_artifact(model, uid_hash);
  CREATE INDEX mcp_artifact_expiry ON identity.mcp_artifact(expires_at);
  ALTER TABLE identity.mcp_artifact ENABLE ROW LEVEL SECURITY;
  ALTER TABLE identity.mcp_artifact FORCE ROW LEVEL SECURITY;
  CREATE POLICY artifact_read ON identity.mcp_artifact FOR SELECT TO lazyfinance_runtime
    USING (current_setting('lazyfinance.context_kind', true) = 'mcp-authorization'
      OR (model = 'Grant' AND account_id = (SELECT identity.current_user_id()))
      OR EXISTS (SELECT 1 FROM identity.mcp_grant g WHERE g.id = grant_id AND g.user_id = (SELECT identity.current_user_id())));
  CREATE POLICY artifact_insert ON identity.mcp_artifact FOR INSERT TO lazyfinance_runtime
    WITH CHECK (current_setting('lazyfinance.context_kind', true) = 'mcp-authorization');
  CREATE POLICY artifact_update ON identity.mcp_artifact FOR UPDATE TO lazyfinance_runtime
    USING (current_setting('lazyfinance.context_kind', true) = 'mcp-authorization')
    WITH CHECK (current_setting('lazyfinance.context_kind', true) = 'mcp-authorization');
  CREATE POLICY artifact_delete ON identity.mcp_artifact FOR DELETE TO lazyfinance_runtime
    USING (current_setting('lazyfinance.context_kind', true) = 'mcp-authorization'
      OR EXISTS (SELECT 1 FROM identity.mcp_grant g WHERE g.id = grant_id AND g.user_id = (SELECT identity.current_user_id())));
  GRANT SELECT, INSERT, UPDATE, DELETE ON identity.mcp_artifact TO lazyfinance_runtime;`.execute(
    db,
  );
}

export async function down(): Promise<never> {
  throw new Error(
    "External grants require an explicit revocation and recovery plan",
  );
}
