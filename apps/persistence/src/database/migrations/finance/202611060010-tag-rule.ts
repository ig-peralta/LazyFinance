import { sql } from "kysely";
import {
  currentUser,
  type MigrationDatabase,
  ownedAccount,
  ownedTag,
  protectTable,
} from "../../migration-helpers";

export async function up(db: MigrationDatabase) {
  await sql`CREATE TYPE finance.tag_rule_direction AS ENUM ('debit','credit');
  CREATE TYPE finance.tag_rule_field AS ENUM ('merchant','description');
  CREATE TYPE finance.tag_rule_mode AS ENUM ('suggest','auto');
  CREATE TABLE finance.tag_rule (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES identity."user"(id) ON DELETE CASCADE,
    tag_id uuid NOT NULL REFERENCES finance.tag(id) ON DELETE RESTRICT,
    account_id uuid REFERENCES finance.account(id) ON DELETE RESTRICT,
    direction finance.tag_rule_direction NOT NULL, match_field finance.tag_rule_field NOT NULL,
    match_value varchar(240) NOT NULL CHECK (length(trim(match_value)) > 0), priority integer NOT NULL DEFAULT 0,
    mode finance.tag_rule_mode NOT NULL DEFAULT 'suggest', approved_at timestamptz, active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK ((mode = 'auto' AND approved_at IS NOT NULL) OR (mode = 'suggest' AND approved_at IS NULL))
  );
  CREATE INDEX tag_rule_user_active_idx ON finance.tag_rule(user_id, active);
  CREATE UNIQUE INDEX tag_rule_active_owner_match_uniq ON finance.tag_rule
    (user_id, tag_id, direction, match_field, match_value, coalesce(account_id, '00000000-0000-0000-0000-000000000000'::uuid)) WHERE active;
  `.execute(db);
  await protectTable(
    db,
    "tag_rule",
    `user_id = ${currentUser}`,
    `user_id = ${currentUser} AND ${ownedTag("tag_rule.tag_id")} AND (account_id IS NULL OR ${ownedAccount("tag_rule.account_id")})`,
  );
}
export async function down(db: MigrationDatabase) {
  await sql`DROP TABLE finance.tag_rule; DROP TYPE finance.tag_rule_direction; DROP TYPE finance.tag_rule_field; DROP TYPE finance.tag_rule_mode`.execute(
    db,
  );
}
