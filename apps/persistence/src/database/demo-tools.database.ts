import {
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import type { Kysely } from "kysely";
import { sql } from "kysely";
import type { AssistantTables } from "../assistant/assistant.tables";
import type { FinanceTables } from "../finance/finance.tables";
import { createDatabase } from "./connection";
import { DEMO_TOOLS_ROLE_COMMENT } from "./demo-tools-provision";

@Injectable()
export class DemoToolsDatabase implements OnModuleInit, OnModuleDestroy {
  private database?: Kysely<FinanceTables & AssistantTables>;

  async onModuleInit() {
    if (process.env.DEMO_TOOLS_ENABLED !== "true") {
      if (process.env.DEMO_TOOLS_DATABASE_URL)
        throw new Error(
          "Demo tools credentials require DEMO_TOOLS_ENABLED=true",
        );
      return;
    }

    const connectionString = process.env.DEMO_TOOLS_DATABASE_URL;
    const expectedDatabase = process.env.DEMO_TOOLS_DATABASE_NAME;
    const expectedRole = process.env.DEMO_TOOLS_DATABASE_USER;
    if (!connectionString || !expectedDatabase || !expectedRole)
      throw new Error(
        "Enabled demo tools require a dedicated database connection",
      );

    const url = new URL(connectionString);
    if (
      !["postgres:", "postgresql:"].includes(url.protocol) ||
      url.pathname.slice(1) !== expectedDatabase ||
      url.username !== expectedRole ||
      !url.password ||
      !/^[a-z][a-z0-9_]{0,62}$/.test(expectedRole) ||
      !/^[a-zA-Z0-9_]+$/.test(expectedDatabase)
    )
      throw new Error("Invalid demo tools database boundary configuration");

    const db = createDatabase<FinanceTables & AssistantTables>(
      connectionString,
      true,
      3,
    );
    try {
      const {
        rows: [boundary],
      } = await sql<{ safe: boolean }>`select
        current_database() = ${expectedDatabase}
        and current_user = ${expectedRole}
        and exists (select 1 from pg_roles where rolname = current_user
          and rolcanlogin and rolbypassrls and not rolsuper and not rolcreaterole
          and not rolcreatedb and not rolreplication and not rolinherit
          and rolconnlimit between 1 and 5
          and shobj_description(oid, 'pg_authid') = ${DEMO_TOOLS_ROLE_COMMENT})
        and not exists (select 1 from pg_auth_members membership
          join pg_roles role on role.oid = membership.member
          where role.rolname = current_user)
        and not pg_has_role(current_user, 'lazyfinance_runtime', 'member')
        and not pg_has_role(current_user,
          (select datdba from pg_database where datname = current_database()), 'member')
        and not has_schema_privilege(current_user, 'identity', 'usage')
        and not has_schema_privilege(current_user, 'finance', 'create')
        and not has_schema_privilege(current_user, 'assistant', 'create')
        and has_table_privilege(current_user, 'finance.account', 'delete')
        and has_table_privilege(current_user, 'assistant.action', 'delete')
        and has_table_privilege(current_user, 'finance.provider', 'select')
        and not has_table_privilege(current_user, 'finance.provider', 'insert, update, delete, truncate')
        and (select count(*) = 4
          and bool_and(not has_table_privilege(current_user, relation.oid, 'select'))
          from pg_class relation
          join pg_namespace namespace on namespace.oid = relation.relnamespace
          where namespace.nspname = 'identity'
            and relation.relname in ('user', 'external_identity', 'mcp_grant', 'mcp_artifact'))
        as safe`.execute(db);
      if (!boundary?.safe)
        throw new Error("Demo tools database login does not meet its boundary");
      this.database = db;
    } catch (error) {
      await db.destroy();
      throw error;
    }
  }

  connection() {
    return this.database;
  }

  async onModuleDestroy() {
    await this.database?.destroy();
  }
}
