import { readdir } from "node:fs/promises";
import path from "node:path";
import type { Kysely } from "kysely";
import {
  type Migration,
  type MigrationProvider,
  Migrator,
} from "kysely/migration";

export class MultiMigrationProvider implements MigrationProvider {
  constructor(
    private readonly load: (file: string) => Migration | Promise<Migration> = (
      file,
    ) => require(file) as Migration,
  ) {}

  async getMigrations() {
    const result: Record<string, Migration> = {};

    for (const schema of ["identity", "finance"]) {
      const folder = path.join(__dirname, "migrations", schema);
      const files = (await readdir(folder)).filter(
        (name) => /\.(ts|js)$/.test(name) && !name.endsWith(".d.ts"),
      );
      if (!files.length) throw new Error(`Missing migrations for ${schema}`);

      for (const file of files) {
        const name = file.replace(/\.(ts|js)$/, "");
        if (result[name]) throw new Error(`Duplicate migration ${name}`);

        result[name] = await this.load(path.join(folder, file));
      }
    }

    return Object.fromEntries(
      Object.entries(result).sort(([a], [b]) => a.localeCompare(b)),
    );
  }
}

export async function migrate(
  database: Kysely<any>,
  provider: MigrationProvider = new MultiMigrationProvider(),
) {
  const { error, results } = await new Migrator({
    db: database,
    provider,
  }).migrateToLatest();
  if (error) throw error;

  return results;
}
