import { sql } from "kysely";
import {
  currentUser,
  type MigrationDatabase,
  ownedConnection,
  protectTable,
} from "../../migration-helpers";

export async function up(db: MigrationDatabase) {
  await sql`CREATE TYPE finance.account_type AS ENUM ('checking','savings','credit_card');
  CREATE TYPE finance.currency AS ENUM ('CLP');
  CREATE TYPE finance.history_completeness AS ENUM ('complete','partial','unknown');
  CREATE TABLE finance.account (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES identity."user"(id) ON DELETE CASCADE,
    provider_connection_id uuid NOT NULL REFERENCES finance.provider_connection(id) ON DELETE RESTRICT,
    external_id varchar(512), type finance.account_type NOT NULL,
    number varchar(64), holder_name varchar(120), holder_rut varchar(16), alias varchar(80),
    currency finance.currency NOT NULL DEFAULT 'CLP', balance numeric(15,2), active boolean NOT NULL DEFAULT true,
    last_synced_at timestamptz, provider_observed_at timestamptz,
    history_completeness finance.history_completeness NOT NULL DEFAULT 'unknown', history_from date, history_through date,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(provider_connection_id, external_id),
    CHECK ((history_from IS NULL OR history_through IS NULL OR history_from <= history_through)
      AND (history_completeness != 'complete' OR (history_from IS NOT NULL AND history_through IS NOT NULL))
      AND (history_completeness != 'unknown' OR (history_from IS NULL AND history_through IS NULL)))
  );
  CREATE INDEX account_user_id_idx ON finance.account(user_id);
  CREATE INDEX account_provider_connection_id_idx ON finance.account(provider_connection_id);
  `.execute(db);
  await protectTable(
    db,
    "account",
    `user_id = ${currentUser}`,
    `user_id = ${currentUser} AND ${ownedConnection("account.provider_connection_id")}`,
  );
}

export async function down(db: MigrationDatabase) {
  await sql`DROP TABLE finance.account; DROP TYPE finance.account_type; DROP TYPE finance.currency; DROP TYPE finance.history_completeness`.execute(
    db,
  );
}
