import { sql } from "kysely";
import type { MigrationDatabase } from "../../migration-helpers";

export async function up(db: MigrationDatabase) {
  await sql`CREATE TABLE assistant.processing_consent (
    user_id uuid PRIMARY KEY REFERENCES identity."user"(id),
    policy_key text NOT NULL CHECK (policy_key ~ '^[a-f0-9]{64}$'),
    decision text NOT NULL CHECK (decision IN ('accepted', 'refused')),
    revision integer NOT NULL CHECK (revision > 0),
    decided_at timestamptz NOT NULL DEFAULT statement_timestamp()
  );
  ALTER TABLE assistant.processing_consent ENABLE ROW LEVEL SECURITY;
  ALTER TABLE assistant.processing_consent FORCE ROW LEVEL SECURITY;
  CREATE POLICY self_read ON assistant.processing_consent FOR SELECT TO lazyfinance_runtime
    USING (user_id = (SELECT identity.current_user_id()));
  CREATE POLICY self_insert ON assistant.processing_consent FOR INSERT TO lazyfinance_runtime
    WITH CHECK (user_id = (SELECT identity.current_user_id()));
  CREATE POLICY self_update ON assistant.processing_consent FOR UPDATE TO lazyfinance_runtime
    USING (user_id = (SELECT identity.current_user_id()))
    WITH CHECK (user_id = (SELECT identity.current_user_id()));
  GRANT SELECT, INSERT ON assistant.processing_consent TO lazyfinance_runtime;
  GRANT UPDATE (policy_key, decision, revision, decided_at) ON assistant.processing_consent TO lazyfinance_runtime;
  `.execute(db);
}

export async function down(): Promise<never> {
  throw new Error("Assistant consent requires an explicit recovery plan");
}
