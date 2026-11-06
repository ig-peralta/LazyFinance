import { sql } from "kysely";
import {
  type MigrationDatabase,
  ownedConnection,
  protectTable,
} from "../../migration-helpers";

export async function up(db: MigrationDatabase) {
  await sql`CREATE TYPE finance.provider_sync_failure AS ENUM ('retryable','expired','revoked','invalid_data');
  CREATE TYPE finance.provider_sync_result AS ENUM ('complete','needs_review');
  CREATE TABLE finance.provider_sync_state (
    provider_connection_id uuid PRIMARY KEY REFERENCES finance.provider_connection(id) ON DELETE CASCADE,
    checkpoint varchar(512), revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
    last_attempt_at timestamptz, last_success_at timestamptz, last_provider_observed_at timestamptz,
    last_result finance.provider_sync_result, unresolved_conflict_count integer NOT NULL DEFAULT 0 CHECK (unresolved_conflict_count >= 0),
    last_failure_at timestamptz, last_failure_reason finance.provider_sync_failure, retry_after timestamptz
  )`.execute(db);
  await protectTable(
    db,
    "provider_sync_state",
    ownedConnection("provider_sync_state.provider_connection_id"),
  );
}
export async function down(db: MigrationDatabase) {
  await sql`DROP TABLE finance.provider_sync_state; DROP TYPE finance.provider_sync_failure, finance.provider_sync_result`.execute(
    db,
  );
}
