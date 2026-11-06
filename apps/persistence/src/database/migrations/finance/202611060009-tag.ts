import { sql } from "kysely";
import {
  currentUser,
  type MigrationDatabase,
  protectTable,
} from "../../migration-helpers";

export async function up(db: MigrationDatabase) {
  await sql`CREATE TABLE finance.tag (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES identity."user"(id) ON DELETE CASCADE,
    name varchar(80) NOT NULL, color varchar(7), is_archived boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(user_id, name)
  ); CREATE INDEX tag_user_id_idx ON finance.tag(user_id)`.execute(db);
  await protectTable(db, "tag", `user_id = ${currentUser}`);
}
export async function down(db: MigrationDatabase) {
  await db.schema.dropTable("finance.tag").execute();
}
