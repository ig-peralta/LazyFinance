import { type Kysely, sql } from "kysely";

export async function assertRuntimeRole(database: Kysely<any>) {
  const {
    rows: [role],
  } = await sql<{ safe: boolean }>`SELECT
    NOT r.rolsuper AND NOT r.rolbypassrls AND NOT r.rolcreaterole AND NOT r.rolcreatedb AND NOT r.rolreplication
    AND r.rolcanlogin AND pg_has_role(current_user, 'lazyfinance_runtime', 'member')
    AND NOT pg_has_role(current_user, 'lazyfinance_identity_bootstrap', 'member')
    AND NOT pg_has_role(current_user, (SELECT datdba FROM pg_database WHERE datname=current_database()), 'member')
    AND NOT EXISTS (SELECT 1 FROM pg_roles powerful WHERE
      (powerful.rolsuper OR powerful.rolbypassrls OR powerful.rolcreaterole OR powerful.rolcreatedb OR powerful.rolreplication)
      AND pg_has_role(current_user, powerful.oid, 'member'))
    AND NOT EXISTS (SELECT 1 FROM pg_class t JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname IN ('identity','finance') AND pg_has_role(current_user, t.relowner, 'member'))
    AND NOT EXISTS (SELECT 1 FROM pg_namespace n WHERE n.nspname IN ('identity','finance')
      AND has_schema_privilege(current_user, n.oid, 'CREATE'))
    AS safe FROM pg_roles r WHERE r.rolname = current_user`.execute(database);
  if (!role?.safe)
    throw new Error(
      "Persistence requires a provisioned non-owner, non-BYPASSRLS runtime login",
    );
}

/** Owner-only CLI operation. Existing passwords/roles are never silently changed. */
export async function provisionRuntime(
  database: Kysely<any>,
  login: string,
  password: string,
) {
  if (
    !/^[a-z][a-z0-9_]{0,62}$/.test(login) ||
    ["lazyfinance_runtime", "lazyfinance_identity_bootstrap"].includes(login)
  ) {
    throw new Error("Invalid runtime login name");
  }
  if (password.length < 16)
    throw new Error("Runtime password must contain at least 16 characters");

  return database.transaction().execute(async (tx) => {
    await sql`select pg_advisory_xact_lock(hashtextextended('lazyfinance:provision-runtime', 0))`.execute(
      tx,
    );
    const {
      rows: [existing],
    } = await sql<{ managed: boolean; safe: boolean }>`select
      pg_has_role(target.rolname, 'lazyfinance_runtime', 'member') as managed,
      (NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication AND rolcanlogin
        AND NOT pg_has_role(target.rolname, 'lazyfinance_identity_bootstrap', 'member')
        AND NOT pg_has_role(target.rolname, (SELECT datdba FROM pg_database WHERE datname=current_database()), 'member')
        AND NOT EXISTS (SELECT 1 FROM pg_roles powerful WHERE
          (powerful.rolsuper OR powerful.rolbypassrls OR powerful.rolcreaterole OR powerful.rolcreatedb OR powerful.rolreplication)
          AND pg_has_role(target.rolname, powerful.oid, 'member'))
        AND NOT EXISTS (SELECT 1 FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace
          WHERE n.nspname IN ('identity','finance') AND pg_has_role(target.rolname, t.relowner, 'member'))
        AND NOT EXISTS (SELECT 1 FROM pg_namespace n WHERE n.nspname IN ('identity','finance')
          AND has_schema_privilege(target.rolname, n.oid, 'CREATE'))) as safe
      from pg_roles target where rolname = ${login}`.execute(tx);
    if (existing) {
      if (!existing.managed || !existing.safe)
        throw new Error("Refusing to alter an existing unmanaged/unsafe login");

      return { created: false };
    }

    await sql`create role ${sql.id(login)} login inherit nosuperuser nobypassrls nocreatedb nocreaterole noreplication password ${sql.lit(password)}`.execute(
      tx,
    );
    await sql`grant lazyfinance_runtime to ${sql.id(login)}`.execute(tx);

    return { created: true };
  });
}
