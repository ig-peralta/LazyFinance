import { sql } from "kysely";
import { type MigrationDatabase, ownedMovement } from "../../migration-helpers";

export async function up(db: MigrationDatabase) {
  // Both parents still pass transaction/account RLS. Set membership permits one
  // owned-key lookup per statement instead of correlated parent checks per row.
  await sql`ALTER POLICY user_read ON finance.expense_adjustment USING (
    credit_transaction_id IN (
      SELECT m.id FROM finance.transaction m JOIN finance.account a ON a.id=m.account_id
      WHERE a.user_id=(SELECT identity.current_user_id())
    ) AND purchase_transaction_id IN (
      SELECT m.id FROM finance.transaction m JOIN finance.account a ON a.id=m.account_id
      WHERE a.user_id=(SELECT identity.current_user_id())
    )
  )`.execute(db);
}

export async function down(db: MigrationDatabase) {
  await sql
    .raw(`ALTER POLICY user_read ON finance.expense_adjustment USING (
    ${ownedMovement("credit_transaction_id")} AND ${ownedMovement("purchase_transaction_id")}
  )`)
    .execute(db);
}
