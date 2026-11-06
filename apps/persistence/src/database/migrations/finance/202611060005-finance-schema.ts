import { sql } from "kysely";
import type { MigrationDatabase } from "../../migration-helpers";

export async function up(db: MigrationDatabase) {
  await sql`CREATE SCHEMA finance;
    REVOKE ALL ON SCHEMA finance FROM PUBLIC;
    GRANT USAGE ON SCHEMA finance TO lazyfinance_runtime;
    REVOKE CREATE ON SCHEMA public FROM PUBLIC;
  `.execute(db);
}

export async function down(): Promise<never> {
  throw new Error("Finance schema requires explicit recovery");
}
