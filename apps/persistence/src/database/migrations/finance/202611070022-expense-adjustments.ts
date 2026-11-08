import { sql } from "kysely";
import {
  type MigrationDatabase,
  ownedMovement,
  protectTable,
} from "../../migration-helpers";

export async function up(db: MigrationDatabase) {
  await sql`CREATE TABLE finance.expense_adjustment (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    credit_transaction_id uuid NOT NULL REFERENCES finance.transaction(id),
    purchase_transaction_id uuid NOT NULL REFERENCES finance.transaction(id),
    kind text NOT NULL CHECK (kind IN ('refund', 'reimbursement')),
    amount numeric(15,2) NOT NULL CHECK (amount > 0),
    credit_amount numeric(15,2) NOT NULL CHECK (credit_amount > 0),
    purchase_amount numeric(15,2) NOT NULL CHECK (purchase_amount < 0),
    credit_booked_at timestamptz NOT NULL,
    purchase_booked_at timestamptz NOT NULL,
    confirmed_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (credit_transaction_id, purchase_transaction_id),
    CHECK (credit_transaction_id <> purchase_transaction_id),
    CHECK (amount <= credit_amount AND amount <= -purchase_amount),
    CHECK (credit_booked_at >= purchase_booked_at)
  );
  CREATE INDEX expense_adjustment_purchase_idx ON finance.expense_adjustment(purchase_transaction_id);`.execute(
    db,
  );
  await protectTable(
    db,
    "expense_adjustment",
    `${ownedMovement("credit_transaction_id")} AND ${ownedMovement("purchase_transaction_id")}`,
  );
}

export async function down(db: MigrationDatabase) {
  await sql`DROP TABLE finance.expense_adjustment`.execute(db);
}
