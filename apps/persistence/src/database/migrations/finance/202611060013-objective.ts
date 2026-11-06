import { sql } from "kysely";
import {
  currentUser,
  type MigrationDatabase,
  protectTable,
} from "../../migration-helpers";

export async function up(db: MigrationDatabase) {
  await sql`CREATE TYPE finance.objective_kind AS ENUM ('time_based','amount_based');
  CREATE TYPE finance.objective_intent AS ENUM ('spending','saving');
  CREATE TYPE finance.objective_period AS ENUM ('daily','weekly','monthly','yearly');
  CREATE TABLE finance.objective (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES identity."user"(id) ON DELETE CASCADE,
    name varchar(80) NOT NULL, amount numeric(15,2) NOT NULL CHECK (amount > 0), kind finance.objective_kind NOT NULL,
    intent finance.objective_intent NOT NULL, is_recurring boolean, period finance.objective_period,
    start_date timestamptz, end_date timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK ((kind = 'amount_based' AND is_recurring IS NULL AND period IS NULL AND start_date IS NULL AND end_date IS NULL)
      OR (kind = 'time_based' AND is_recurring = true AND period IS NOT NULL AND start_date IS NOT NULL)
      OR (kind = 'time_based' AND is_recurring = false AND period IS NULL AND start_date IS NOT NULL AND end_date IS NOT NULL)),
    CHECK (end_date IS NULL OR start_date IS NULL OR end_date > start_date)
  ); CREATE INDEX objective_user_id_idx ON finance.objective(user_id)`.execute(
    db,
  );
  await protectTable(db, "objective", `user_id = ${currentUser}`);
}

export async function down(db: MigrationDatabase) {
  await sql`DROP TABLE finance.objective; DROP TYPE finance.objective_kind, finance.objective_intent, finance.objective_period`.execute(
    db,
  );
}
