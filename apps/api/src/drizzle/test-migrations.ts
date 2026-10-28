import { migrate } from 'drizzle-orm/postgres-js/migrator';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

// Separate integration specs can start in parallel. Serialize first-time
// migrations across their processes/connections without locking normal reads.
export async function migrateTestDatabase(db: PostgresJsDatabase<typeof schema>, connectionString: string) {
  const lockClient = postgres(connectionString, { max: 1 });
  try {
    await lockClient.begin(async (lock) => {
      await lock`SELECT pg_advisory_xact_lock(20261028, 50)`;
      await migrate(db, { migrationsFolder: 'src/drizzle/migrations' });
    });
  } finally {
    await lockClient.end();
  }
}
