import { sql } from "kysely";
import {
  currentUser,
  type MigrationDatabase,
  protectTable,
} from "../../migration-helpers";

export async function up(db: MigrationDatabase) {
  await sql`CREATE TYPE finance.income_regularity AS ENUM ('regular','irregular');
  CREATE TYPE finance.income_amount_kind AS ENUM ('fixed','variable');
  CREATE TABLE finance.income_source (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES identity."user"(id) ON DELETE CASCADE,
    name varchar(80) NOT NULL, currency finance.currency NOT NULL DEFAULT 'CLP', regularity finance.income_regularity NOT NULL,
    amount_kind finance.income_amount_kind NOT NULL, expected_amount numeric(15,2), schedule jsonb,
    start_date date NOT NULL, end_date date, archived_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (expected_amount IS NULL OR expected_amount > 0), CHECK (amount_kind != 'fixed' OR expected_amount IS NOT NULL),
    CHECK ((regularity = 'regular' AND schedule IS NOT NULL) OR (regularity = 'irregular' AND schedule IS NULL)),
    CHECK (end_date IS NULL OR end_date >= start_date)
  ); CREATE INDEX income_source_user_id_idx ON finance.income_source(user_id)`.execute(
    db,
  );
  await protectTable(db, "income_source", `user_id = ${currentUser}`);
}
export async function down(db: MigrationDatabase) {
  await sql`DROP TABLE finance.income_source; DROP TYPE finance.income_regularity, finance.income_amount_kind`.execute(
    db,
  );
}
