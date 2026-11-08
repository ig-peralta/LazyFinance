import { sql } from "kysely";
import type { MigrationDatabase } from "../../migration-helpers";

export async function up(db: MigrationDatabase) {
  await sql`ALTER TABLE finance.provider_sync_state ADD COLUMN lease_expires_at timestamptz;
    ALTER TYPE finance.provider_movement_conflict_reason ADD VALUE 'provider_unbooked'`.execute(
    db,
  );
}

export async function down(db: MigrationDatabase) {
  // A downgrade must not erase suspended interpretations or their audit facts.
  await sql`DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM finance.provider_movement_conflict WHERE reason::text='provider_unbooked') THEN
      RAISE EXCEPTION 'Cannot downgrade while provider-unbooked audit records exist';
    END IF;
  END $$;
  ALTER TABLE finance.provider_movement_conflict ALTER COLUMN reason TYPE text USING reason::text;
  DROP TYPE finance.provider_movement_conflict_reason;
  CREATE TYPE finance.provider_movement_conflict_reason AS ENUM ('receipt_incompatible','internal_override_disagrees','removed_confirmed_income');
  ALTER TABLE finance.provider_movement_conflict ALTER COLUMN reason TYPE finance.provider_movement_conflict_reason USING reason::finance.provider_movement_conflict_reason;
  ALTER TABLE finance.provider_sync_state DROP COLUMN lease_expires_at`.execute(
    db,
  );
}
