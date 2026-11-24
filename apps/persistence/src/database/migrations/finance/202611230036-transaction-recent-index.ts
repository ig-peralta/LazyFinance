import { sql } from "kysely";
import type { MigrationDatabase } from "../../migration-helpers";

export async function up(db: MigrationDatabase) {
  await sql`CREATE INDEX transaction_account_recent_idx
    ON finance.transaction(account_id,booked_at DESC,id DESC)
    WHERE removed_at IS NULL`.execute(db);
}

export async function down(db: MigrationDatabase) {
  await sql`DROP INDEX finance.transaction_account_recent_idx`.execute(db);
}
