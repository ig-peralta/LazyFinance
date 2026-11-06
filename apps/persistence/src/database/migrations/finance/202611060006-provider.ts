import { sql } from "kysely";
import type { MigrationDatabase } from "../../migration-helpers";

export async function up(db: MigrationDatabase) {
  await sql`CREATE TABLE finance.provider (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    identifier varchar(64) NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  GRANT SELECT ON finance.provider TO lazyfinance_runtime;
  `.execute(db);
}

export async function down(db: MigrationDatabase) {
  await db.schema.dropTable("finance.provider").execute();
}
