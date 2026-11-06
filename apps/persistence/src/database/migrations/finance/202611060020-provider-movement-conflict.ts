import { sql } from "kysely";
import {
  type MigrationDatabase,
  ownedMovement,
  protectTable,
} from "../../migration-helpers";

export async function up(db: MigrationDatabase) {
  await sql`CREATE TYPE finance.provider_movement_conflict_reason AS ENUM ('receipt_incompatible','internal_override_disagrees','removed_confirmed_income');
  CREATE TABLE finance.provider_movement_conflict (
    transaction_id uuid NOT NULL REFERENCES finance."transaction"(id) ON DELETE CASCADE,
    reason finance.provider_movement_conflict_reason NOT NULL, previous_facts jsonb NOT NULL, incoming_facts jsonb NOT NULL,
    observed_at timestamptz NOT NULL, resolved_at timestamptz, PRIMARY KEY(transaction_id, reason)
  )`.execute(db);
  await protectTable(
    db,
    "provider_movement_conflict",
    ownedMovement("provider_movement_conflict.transaction_id"),
  );
}

export async function down(db: MigrationDatabase) {
  await sql`DROP TABLE finance.provider_movement_conflict; DROP TYPE finance.provider_movement_conflict_reason`.execute(
    db,
  );
}
