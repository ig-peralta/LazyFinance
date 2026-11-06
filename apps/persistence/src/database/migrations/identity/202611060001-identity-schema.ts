import { sql } from "kysely";
import type { MigrationDatabase } from "../../migration-helpers";

export async function up(db: MigrationDatabase) {
  // Database roles are cluster-scoped. Never silently change an existing role.
  await sql`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lazyfinance_runtime') THEN
      CREATE ROLE lazyfinance_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lazyfinance_identity_bootstrap') THEN
      CREATE ROLE lazyfinance_identity_bootstrap NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN ('lazyfinance_runtime', 'lazyfinance_identity_bootstrap')
      AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls OR rolcanlogin)) THEN
      RAISE EXCEPTION 'Unsafe pre-existing LazyFinance role';
    END IF;
  END $$;
  CREATE SCHEMA identity;
  REVOKE ALL ON SCHEMA identity FROM PUBLIC;
  GRANT USAGE ON SCHEMA identity TO lazyfinance_runtime, lazyfinance_identity_bootstrap;
  CREATE FUNCTION identity.current_user_id() RETURNS uuid LANGUAGE sql STABLE
    SET search_path = pg_catalog, pg_temp
    AS $$ SELECT CASE WHEN current_setting('lazyfinance.context_kind', true) = 'user'
      THEN nullif(current_setting('lazyfinance.user_id', true), '')::uuid ELSE NULL END $$;
  REVOKE ALL ON FUNCTION identity.current_user_id() FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION identity.current_user_id() TO lazyfinance_runtime;
  `.execute(db);
}

export async function down(): Promise<never> {
  throw new Error("Identity foundation cannot be dropped automatically");
}
