import { sql } from "kysely";
import {
  currentUser,
  type MigrationDatabase,
  protectTable,
} from "../../migration-helpers";

export async function up(db: MigrationDatabase) {
  await sql`CREATE TYPE finance.connection_status AS ENUM ('active','revoked','expired');
  CREATE TYPE finance.connection_mode AS ENUM ('test','live');
  CREATE TABLE finance.provider_connection (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES identity."user"(id) ON DELETE CASCADE,
    provider_id uuid NOT NULL REFERENCES finance.provider(id),
    metadata jsonb NOT NULL DEFAULT '{}',
    status finance.connection_status NOT NULL DEFAULT 'active',
    mode finance.connection_mode,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX provider_connection_user_id_idx ON finance.provider_connection(user_id);
  CREATE INDEX provider_connection_provider_id_idx ON finance.provider_connection(provider_id);
  `.execute(db);
  await protectTable(db, "provider_connection", `user_id = ${currentUser}`);
}
export async function down(db: MigrationDatabase) {
  await sql`DROP TABLE finance.provider_connection; DROP TYPE finance.connection_status; DROP TYPE finance.connection_mode`.execute(
    db,
  );
}
