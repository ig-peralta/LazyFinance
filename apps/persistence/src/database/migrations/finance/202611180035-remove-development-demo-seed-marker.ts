import { type MigrationDatabase } from "../../migration-helpers";

export async function up(db: MigrationDatabase) {
  await db.schema.dropTable("finance.development_demo_seed").execute();
}

export async function down(): Promise<never> {
  throw new Error(
    "Development demo seed markers were replaced by the demo-tools reset operation",
  );
}
