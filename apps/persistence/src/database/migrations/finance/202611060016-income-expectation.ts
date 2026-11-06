import { sql } from "kysely";
import {
  type MigrationDatabase,
  ownedSource,
  protectTable,
} from "../../migration-helpers";

export async function up(db: MigrationDatabase) {
  await sql`CREATE TABLE finance.income_expectation (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source_id uuid NOT NULL REFERENCES finance.income_source(id) ON DELETE CASCADE,
    date date NOT NULL, amount numeric(15,2) NOT NULL CHECK (amount > 0), is_estimate boolean NOT NULL DEFAULT false
  ); CREATE INDEX income_expectation_source_date_idx ON finance.income_expectation(source_id, date)`.execute(
    db,
  );
  await protectTable(
    db,
    "income_expectation",
    ownedSource("income_expectation.source_id"),
  );
}
export async function down(db: MigrationDatabase) {
  await db.schema.dropTable("finance.income_expectation").execute();
}
