import { sql } from "kysely";
import type { MigrationDatabase } from "./migration-helpers";

const RESETTABLE_TABLES = [
  "account",
  "budget_revision",
  "budget_revision_tag",
  "expense_adjustment",
  "income_expectation",
  "income_receipt",
  "income_source",
  "objective",
  "objective_tag",
  "provider_connection",
  "provider_link_intent",
  "provider_movement_conflict",
  "provider_movement_removal",
  "provider_account_selection",
  "provider_sync_schedule",
  "provider_sync_state",
  "savings_revision",
  "savings_revision_tag",
  "tag",
  "tag_decision_event",
  "tag_rule",
  "transaction",
] as const;

const ASSISTANT_TABLES = [
  "action",
  "conversation",
  "processing_consent",
] as const;

export const DEMO_TOOLS_ROLE_COMMENT =
  "LazyFinance development-only demo tools; never grant to application roles";

export async function provisionDemoToolsRole(
  db: MigrationDatabase,
  login: string,
  password: string,
) {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(login))
    throw new Error("Invalid demo tools login name");
  if (password.length < 24)
    throw new Error("Demo tools password must contain at least 24 characters");

  return db.transaction().execute(async (tx) => {
    await sql`select pg_advisory_xact_lock(hashtextextended('lazyfinance:provision-demo-tools', 0))`.execute(
      tx,
    );
    const {
      rows: [existing],
    } = await sql<{
      managed: boolean;
      safe: boolean;
    }>`select
      shobj_description(target.oid, 'pg_authid') = ${DEMO_TOOLS_ROLE_COMMENT} as managed,
      target.rolcanlogin AND target.rolbypassrls AND NOT target.rolsuper
        AND NOT target.rolcreatedb AND NOT target.rolcreaterole AND NOT target.rolreplication
        AND NOT target.rolinherit
        AND target.rolconnlimit BETWEEN 1 AND 5
        AND NOT EXISTS (select 1 from pg_auth_members membership where membership.member = target.oid)
        AND NOT pg_has_role(target.rolname,
          (select datdba from pg_database where datname = current_database()), 'member')
        AND NOT EXISTS (select 1 from pg_class table_row join pg_namespace schema_row
          on schema_row.oid = table_row.relnamespace
          where schema_row.nspname in ('identity','finance','assistant')
            and pg_has_role(target.rolname, table_row.relowner, 'member'))
        AND NOT EXISTS (select 1 from pg_namespace schema_row
          where schema_row.nspname in ('identity','finance','assistant')
            and has_schema_privilege(target.rolname, schema_row.oid, 'CREATE')) as safe
      from pg_roles target where target.rolname = ${login}`.execute(tx);

    if (existing && (!existing.managed || !existing.safe))
      throw new Error(
        "Refusing to alter an existing unmanaged or unsafe demo tools login",
      );

    if (!existing) {
      await sql`create role ${sql.id(login)} login noinherit bypassrls nosuperuser nocreatedb nocreaterole noreplication connection limit 5 password ${sql.lit(password)}`.execute(
        tx,
      );
      await sql`comment on role ${sql.id(login)} is ${sql.lit(DEMO_TOOLS_ROLE_COMMENT)}`.execute(
        tx,
      );
    } else {
      await sql`alter role ${sql.id(login)} password ${sql.lit(password)}`.execute(
        tx,
      );
    }

    await sql`revoke all privileges on schema identity, finance, assistant from ${sql.id(login)};
      grant usage on schema finance, assistant to ${sql.id(login)};
      revoke all privileges on all tables in schema identity, finance, assistant from ${sql.id(login)};
      grant select on finance.provider to ${sql.id(login)};`.execute(tx);

    for (const table of RESETTABLE_TABLES) {
      await sql`grant select, insert, update, delete on finance.${sql.id(table)} to ${sql.id(login)}`.execute(
        tx,
      );
    }
    for (const table of ASSISTANT_TABLES) {
      await sql`grant select, insert, update, delete on assistant.${sql.id(table)} to ${sql.id(login)}`.execute(
        tx,
      );
    }

    return { created: !existing };
  });
}
