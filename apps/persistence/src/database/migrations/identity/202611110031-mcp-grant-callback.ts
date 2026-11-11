import { sql } from "kysely";
import type { MigrationDatabase } from "../../migration-helpers";

// Additive: old grants retain their history without inventing a callback.
export async function up(db: MigrationDatabase) {
  await sql`ALTER TABLE identity.mcp_grant ADD COLUMN redirect_uri text
    CHECK (redirect_uri IS NULL OR length(redirect_uri) BETWEEN 1 AND 2048)`.execute(
    db,
  );
}

export async function down(): Promise<never> {
  throw new Error("Grant callback history requires an explicit recovery plan");
}
