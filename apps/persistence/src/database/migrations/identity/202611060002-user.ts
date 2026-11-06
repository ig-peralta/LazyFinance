import { sql } from "kysely";
import type { MigrationDatabase } from "../../migration-helpers";

export async function up(db: MigrationDatabase) {
  await sql`CREATE TABLE identity."user" (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email varchar(160) NOT NULL,
    name varchar(120) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT user_email_unique UNIQUE (email)
  );
  CREATE UNIQUE INDEX user_email_case_insensitive_unique ON identity."user" (lower(email));
  ALTER TABLE identity."user" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE identity."user" FORCE ROW LEVEL SECURITY;
  CREATE POLICY self_read ON identity."user" FOR SELECT TO lazyfinance_runtime
    USING (id = (SELECT identity.current_user_id()));
  CREATE POLICY bootstrap_read ON identity."user" FOR SELECT TO lazyfinance_identity_bootstrap USING (true);
  CREATE POLICY bootstrap_insert ON identity."user" FOR INSERT TO lazyfinance_identity_bootstrap WITH CHECK (true);
  GRANT SELECT ON identity."user" TO lazyfinance_runtime;
  GRANT SELECT, INSERT ON identity."user" TO lazyfinance_identity_bootstrap;
  `.execute(db);
}

export async function down(): Promise<never> {
  throw new Error("User data requires an explicit recovery plan");
}
