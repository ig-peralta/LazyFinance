import { sql } from "kysely";
import { currentUser, type MigrationDatabase } from "../../migration-helpers";

export async function up(db: MigrationDatabase) {
  await sql`INSERT INTO finance.provider (identifier)
    VALUES ('manual') ON CONFLICT (identifier) DO NOTHING;

    CREATE TABLE finance.development_demo_seed (
      user_id uuid PRIMARY KEY REFERENCES identity."user"(id) ON DELETE CASCADE,
      transaction_count integer NOT NULL CHECK (transaction_count >= 0),
      seeded_at timestamptz NOT NULL DEFAULT now()
    );
    ALTER TABLE finance.development_demo_seed ENABLE ROW LEVEL SECURITY;
    ALTER TABLE finance.development_demo_seed FORCE ROW LEVEL SECURITY;
    CREATE POLICY user_read ON finance.development_demo_seed
      FOR SELECT TO lazyfinance_runtime USING (user_id = ${sql.raw(currentUser)});
    CREATE POLICY user_insert ON finance.development_demo_seed
      FOR INSERT TO lazyfinance_runtime WITH CHECK (user_id = ${sql.raw(currentUser)});
    GRANT SELECT, INSERT ON finance.development_demo_seed TO lazyfinance_runtime;`.execute(
    db,
  );
}

export async function down(db: MigrationDatabase) {
  await sql`ALTER TABLE finance.development_demo_seed NO FORCE ROW LEVEL SECURITY;
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM finance.development_demo_seed) THEN
        RAISE EXCEPTION 'Development demo seed markers require an explicit data-retention plan';
      END IF;
    END $$;
    DROP TABLE finance.development_demo_seed;
    DELETE FROM finance.provider p WHERE p.identifier = 'manual'
      AND NOT EXISTS (
        SELECT 1 FROM finance.provider_connection c WHERE c.provider_id = p.id
      );`.execute(db);
}
