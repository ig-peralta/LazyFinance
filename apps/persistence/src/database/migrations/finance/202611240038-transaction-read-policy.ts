import { sql } from "kysely";
import { type MigrationDatabase, ownedAccount } from "../../migration-helpers";

export async function up(db: MigrationDatabase) {
  // Keep the owned account keys as one statement-local array. Unlike a hashed
  // row subplan, this is also usable as an account_id index condition.
  await sql`ALTER POLICY user_read ON finance.transaction USING (
    account_id = ANY(ARRAY(
      SELECT a.id FROM finance.account a
      WHERE a.user_id=(SELECT identity.current_user_id())
    ))
  )`.execute(db);
}

export async function down(db: MigrationDatabase) {
  await sql
    .raw(`ALTER POLICY user_read ON finance.transaction USING (
      ${ownedAccount('"transaction".account_id')}
    )`)
    .execute(db);
}
