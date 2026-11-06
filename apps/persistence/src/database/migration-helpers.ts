import { type Kysely, sql } from "kysely";

// Only migrations use this handle; they never depend on evolving runtime types.
export type MigrationDatabase = Kysely<any>;

export const currentUser = "(SELECT identity.current_user_id())";

export async function protectTable(
  db: MigrationDatabase,
  table: string,
  visibility: string,
  writable = visibility,
  appendOnly = false,
) {
  await sql`alter table ${sql.id("finance", table)} enable row level security`.execute(
    db,
  );
  await sql`alter table ${sql.id("finance", table)} force row level security`.execute(
    db,
  );
  // These expressions are migration-owned constants, never request input.
  await sql
    .raw(
      `CREATE POLICY user_read ON finance."${table}" FOR SELECT TO lazyfinance_runtime USING (${visibility})`,
    )
    .execute(db);
  await sql
    .raw(
      `CREATE POLICY user_insert ON finance."${table}" FOR INSERT TO lazyfinance_runtime WITH CHECK (${writable})`,
    )
    .execute(db);

  if (!appendOnly) {
    await sql
      .raw(
        `CREATE POLICY user_update ON finance."${table}" FOR UPDATE TO lazyfinance_runtime USING (${visibility}) WITH CHECK (${writable})`,
      )
      .execute(db);
    await sql
      .raw(
        `CREATE POLICY user_delete ON finance."${table}" FOR DELETE TO lazyfinance_runtime USING (${visibility})`,
      )
      .execute(db);
  }

  const actions = appendOnly
    ? "SELECT, INSERT"
    : "SELECT, INSERT, UPDATE, DELETE";
  await sql
    .raw(`GRANT ${actions} ON finance."${table}" TO lazyfinance_runtime`)
    .execute(db);
}

export const ownedAccount = (expression: string) =>
  `EXISTS (SELECT 1 FROM finance.account a WHERE a.id = ${expression} AND a.user_id = ${currentUser})`;

export const ownedTag = (expression: string) =>
  `EXISTS (SELECT 1 FROM finance.tag t WHERE t.id = ${expression} AND t.user_id = ${currentUser})`;

export const ownedRule = (expression: string) =>
  `EXISTS (SELECT 1 FROM finance.tag_rule r WHERE r.id = ${expression} AND r.user_id = ${currentUser})`;

export const ownedMovement = (expression: string) =>
  `EXISTS (SELECT 1 FROM finance."transaction" m WHERE m.id = ${expression} AND ${ownedAccount("m.account_id")})`;

export const ownedConnection = (expression: string) =>
  `EXISTS (SELECT 1 FROM finance.provider_connection c WHERE c.id = ${expression} AND c.user_id = ${currentUser})`;

export const ownedSource = (expression: string) =>
  `EXISTS (SELECT 1 FROM finance.income_source s WHERE s.id = ${expression} AND s.user_id = ${currentUser})`;
