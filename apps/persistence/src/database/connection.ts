import { CamelCasePlugin, Kysely, PostgresDialect } from "kysely";
import { Pool, types } from "pg";

// pg's exact numeric/int8 strings are intentional. Never parse money as Number.
types.setTypeParser(1082, (value) => value);

export function createDatabase<Tables = Record<string, never>>(
  connectionString: string,
  camelCase = true,
) {
  return new Kysely<Tables>({
    dialect: new PostgresDialect({
      pool: new Pool({
        connectionString,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      }),
    }),
    plugins: camelCase
      ? [new CamelCasePlugin({ maintainNestedObjectKeys: true })]
      : [],
  });
}
