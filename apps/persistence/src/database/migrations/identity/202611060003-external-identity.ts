import { sql } from "kysely";
import type { MigrationDatabase } from "../../migration-helpers";

export async function up(db: MigrationDatabase) {
  await sql`CREATE TABLE identity.external_identity (
    provider varchar(40) NOT NULL,
    issuer varchar(512) NOT NULL,
    provider_subject varchar(256) NOT NULL,
    user_id uuid NOT NULL REFERENCES identity."user"(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (provider, issuer, provider_subject),
    UNIQUE (user_id, provider, issuer)
  );
  ALTER TABLE identity.external_identity ENABLE ROW LEVEL SECURITY;
  ALTER TABLE identity.external_identity FORCE ROW LEVEL SECURITY;
  CREATE POLICY bootstrap_read ON identity.external_identity FOR SELECT TO lazyfinance_identity_bootstrap USING (true);
  CREATE POLICY bootstrap_insert ON identity.external_identity FOR INSERT TO lazyfinance_identity_bootstrap WITH CHECK (true);
  GRANT SELECT, INSERT ON identity.external_identity TO lazyfinance_identity_bootstrap;
  `.execute(db);
}
export async function down(): Promise<never> {
  throw new Error("External identity mappings cannot be dropped automatically");
}
