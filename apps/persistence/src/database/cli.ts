import "dotenv/config";
import type { FinanceTables } from "../finance/finance.tables";
import type { IdentityTables } from "../identity/identity.tables";
import { createDatabase } from "./connection";
import { provisionDemoToolsRole } from "./demo-tools-provision";
import { migrate } from "./migrator";
import { provisionRuntime } from "./provision";
import { seedDemo } from "./seed";

async function main() {
  const url = process.env.POSTGRES_MIGRATION_URL;
  if (!url)
    throw new Error("POSTGRES_MIGRATION_URL is required by the owner-only CLI");

  const db = createDatabase<FinanceTables & IdentityTables>(
    url,
    process.argv[2] === "seed",
  );

  try {
    switch (process.argv[2]) {
      case "migrate":
        for (const result of (await migrate(db)) ?? [])
          console.log(`${result.status}: ${result.migrationName}`);

        break;
      case "provision": {
        const login = process.env.PERSISTENCE_DATABASE_USER;
        const password = process.env.PERSISTENCE_DATABASE_PASSWORD;
        if (!login || !password)
          throw new Error(
            "PERSISTENCE_DATABASE_USER and PERSISTENCE_DATABASE_PASSWORD are required",
          );

        const result = await provisionRuntime(db, login, password);
        console.log(
          result.created
            ? "Runtime login provisioned"
            : "Runtime login already provisioned; password unchanged",
        );
        break;
      }
      case "provision-demo-tools": {
        const login = process.env.DEMO_TOOLS_DATABASE_USER;
        const password = process.env.DEMO_TOOLS_DATABASE_PASSWORD;
        if (!login || !password)
          throw new Error(
            "DEMO_TOOLS_DATABASE_USER and DEMO_TOOLS_DATABASE_PASSWORD are required",
          );

        const result = await provisionDemoToolsRole(db, login, password);
        console.log(
          result.created
            ? "Demo tools login provisioned"
            : "Demo tools login verified and privileges refreshed",
        );
        break;
      }
      case "seed":
        console.log(await seedDemo(db));
        break;
      default:
        throw new Error(
          "Expected migrate, provision, provision-demo-tools or seed",
        );
    }
  } finally {
    await db.destroy();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Database CLI failed");
  process.exitCode = 1;
});
