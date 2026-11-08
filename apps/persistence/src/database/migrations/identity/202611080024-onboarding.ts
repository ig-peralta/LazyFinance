import { sql } from "kysely";
import type { MigrationDatabase } from "../../migration-helpers";

export async function up(db: MigrationDatabase) {
  await sql`CREATE TABLE identity.onboarding (
    user_id uuid PRIMARY KEY REFERENCES identity."user"(id),
    status text NOT NULL CHECK (status IN ('skipped', 'completed')),
    completed_at timestamptz,
    CHECK ((status = 'completed') = (completed_at IS NOT NULL))
  );
  ALTER TABLE identity.onboarding ENABLE ROW LEVEL SECURITY;
  ALTER TABLE identity.onboarding FORCE ROW LEVEL SECURITY;
  CREATE POLICY self_read ON identity.onboarding FOR SELECT TO lazyfinance_runtime
    USING (user_id = (SELECT identity.current_user_id()));
  CREATE POLICY self_insert ON identity.onboarding FOR INSERT TO lazyfinance_runtime
    WITH CHECK (user_id = (SELECT identity.current_user_id()));
  CREATE POLICY self_update ON identity.onboarding FOR UPDATE TO lazyfinance_runtime
    USING (user_id = (SELECT identity.current_user_id()))
    WITH CHECK (user_id = (SELECT identity.current_user_id()));
  GRANT SELECT, INSERT ON identity.onboarding TO lazyfinance_runtime;
  GRANT UPDATE (status, completed_at) ON identity.onboarding TO lazyfinance_runtime;
  `.execute(db);
}

export async function down(): Promise<never> {
  throw new Error("Onboarding completion requires an explicit recovery plan");
}
