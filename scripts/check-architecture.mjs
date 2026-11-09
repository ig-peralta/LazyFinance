import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((item) => {
    const full = path.join(directory, item.name);
    return item.isDirectory() ? files(full) : [full];
  });
}

const errors = [];

const databasePackages =
  /^(?:drizzle-orm|drizzle-kit|postgres|pg|kysely)(?:\/|$)/;

for (const file of files("apps/api/src").filter(
  (name) => name.endsWith(".ts") && !name.endsWith(".spec.ts"),
)) {
  const text = readFileSync(file, "utf8");

  for (const [, name] of text.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
    if (
      databasePackages.test(name) ||
      /(?:^|\/)apps\/(?:persistence|ui)\//.test(name) ||
      /(?:^|\/)drizzle\//.test(name)
    )
      errors.push(`${file}: API database/cross-application dependency`);
  }

  if (/process\.env\.(?:PGHOST|PGUSER|PGPASSWORD|DATABASE_URL)/.test(text))
    errors.push(`${file}: API database environment`);
}

for (const file of files("apps/persistence/src").filter((name) =>
  name.endsWith(".ts"),
)) {
  const text = readFileSync(file, "utf8");

  if (
    /from\s+['"](?:drizzle-orm|postgres(?:\/|['"])|[^'"]*apps\/api)/.test(text)
  )
    errors.push(`${file}: old persistence/application dependency`);

  const databaseInfrastructure =
    file.includes("/database/") || file.endsWith("/rpc/rls.middleware.ts");

  if (
    !databaseInfrastructure &&
    /RUNTIME_DB|createDatabase|from ['"]pg['"]/.test(text)
  )
    errors.push(`${file}: raw pool outside database infrastructure`);

  if (!file.includes("/database/") && /sql\.raw\(/.test(text))
    errors.push(`${file}: runtime dynamic SQL`);

  if (
    !file.endsWith(".spec.ts") &&
    /(?:selectFrom|insertInto|updateTable|deleteFrom)\(['"](?!identity\.|finance\.|assistant\.)/.test(
      text,
    )
  )
    errors.push(`${file}: unqualified application table`);
}

for (const file of files("apps/ui/src").filter((name) =>
  name.endsWith(".ts"),
)) {
  const text = readFileSync(file, "utf8");

  if (
    /@lazyfinance\/(?:rpc-persistence|rpc-auth|contracts\/internal)|from ['"](?:@nestjs\/|pg['"]|kysely['"]|firebase-admin)/.test(
      text,
    )
  )
    errors.push(`${file}: UI imports a private/server package`);

  if (!file.endsWith(".spec.ts")) {
    if (/HttpErrorResponse|firstValueFrom/.test(text))
      errors.push(
        `${file}: obsolete HTTP/Observable compatibility in UI data access`,
      );

    if (
      (file.includes("/features/") || file.includes("/pages/dashboard/")) &&
      /TransferState|makeStateKey/.test(text)
    )
      errors.push(
        `${file}: protected feature data must not enter hydration transfer state`,
      );
  }
}

for (const file of files("libs/contracts/src").filter((name) =>
  name.endsWith(".ts"),
)) {
  if (
    /from\s+['"](?:@nestjs\/|kysely|drizzle-orm|@lazyfinance\/rpc-)/.test(
      readFileSync(file, "utf8"),
    )
  )
    errors.push(
      `${file}: contract depends on transport/database implementation`,
    );
}

for (const app of ["api", "persistence"]) {
  for (const file of files(`apps/${app}/src`).filter((name) =>
    name.endsWith(".rpc.ts"),
  )) {
    for (const [decorator] of readFileSync(file, "utf8").matchAll(
      /@(?:Query|Mutation)\(\{[\s\S]*?\}\s*\)/g,
    )) {
      if (
        !/\binput\s*:/.test(decorator) ||
        !/\boutput\s*:/.test(decorator) ||
        !(
          app === "api"
            ? /meta\s*:\s*\{\s*auth\s*:/
            : /meta\s*:\s*\{\s*context\s*:/
        ).test(decorator)
      )
        errors.push(`${file}: missing explicit schema/context metadata`);
    }
  }

  const pkg = JSON.parse(readFileSync(`apps/${app}/package.json`, "utf8"));

  for (const name of Object.keys({
    ...pkg.dependencies,
    ...pkg.devDependencies,
  })) {
    if (["drizzle-orm", "drizzle-kit", "postgres"].includes(name))
      errors.push(`${app}: obsolete database dependency ${name}`);

    if (
      app === "api" &&
      name in pkg.dependencies &&
      databasePackages.test(name)
    )
      errors.push(`api: database runtime dependency ${name}`);
  }
}

if (errors.length) throw new Error(errors.join("\n"));

console.log(
  "API, persistence, contract, generated-schema and browser boundaries OK.",
);
