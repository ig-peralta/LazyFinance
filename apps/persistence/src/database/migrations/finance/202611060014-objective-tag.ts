import { sql } from "kysely";
import {
  currentUser,
  type MigrationDatabase,
  ownedTag,
  protectTable,
} from "../../migration-helpers";

export async function up(db: MigrationDatabase) {
  await sql`CREATE TABLE finance.objective_tag (
    objective_id uuid NOT NULL REFERENCES finance.objective(id) ON DELETE CASCADE,
    tag_id uuid NOT NULL REFERENCES finance.tag(id) ON DELETE CASCADE, PRIMARY KEY(objective_id, tag_id)
  )`.execute(db);
  await protectTable(
    db,
    "objective_tag",
    `EXISTS (SELECT 1 FROM finance.objective o WHERE o.id = objective_tag.objective_id AND o.user_id = ${currentUser}) AND ${ownedTag("objective_tag.tag_id")}`,
  );
}

export async function down(db: MigrationDatabase) {
  await db.schema.dropTable("finance.objective_tag").execute();
}
