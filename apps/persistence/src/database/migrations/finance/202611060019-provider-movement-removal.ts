import { sql } from "kysely";
import {
  type MigrationDatabase,
  ownedConnection,
  protectTable,
} from "../../migration-helpers";

export async function up(db: MigrationDatabase) {
  await sql`CREATE TABLE finance.provider_movement_removal (
    provider_connection_id uuid NOT NULL REFERENCES finance.provider_connection(id) ON DELETE CASCADE,
    account_external_id varchar(512) NOT NULL, movement_external_id varchar(512) NOT NULL,
    reason finance.movement_removal_reason NOT NULL, observed_at timestamptz NOT NULL, provider_updated_at timestamptz,
    PRIMARY KEY(provider_connection_id, account_external_id, movement_external_id)
  )`.execute(db);
  await protectTable(
    db,
    "provider_movement_removal",
    ownedConnection("provider_movement_removal.provider_connection_id"),
  );
}

export async function down(db: MigrationDatabase) {
  await db.schema.dropTable("finance.provider_movement_removal").execute();
}
