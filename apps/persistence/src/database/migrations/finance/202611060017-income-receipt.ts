import { sql } from "kysely";
import {
  type MigrationDatabase,
  ownedMovement,
  ownedSource,
  protectTable,
} from "../../migration-helpers";

export async function up(db: MigrationDatabase) {
  await sql`CREATE TABLE finance.income_receipt (
    transaction_id uuid PRIMARY KEY REFERENCES finance."transaction"(id) ON DELETE CASCADE,
    source_id uuid NOT NULL REFERENCES finance.income_source(id) ON DELETE RESTRICT,
    confirmed_at timestamptz NOT NULL DEFAULT now()
  ); CREATE INDEX income_receipt_source_id_idx ON finance.income_receipt(source_id)`.execute(
    db,
  );
  await protectTable(
    db,
    "income_receipt",
    `${ownedMovement("income_receipt.transaction_id")} AND ${ownedSource("income_receipt.source_id")}`,
  );
}

export async function down(db: MigrationDatabase) {
  await db.schema.dropTable("finance.income_receipt").execute();
}
