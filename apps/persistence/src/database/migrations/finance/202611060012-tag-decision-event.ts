import { sql } from "kysely";
import {
  currentUser,
  type MigrationDatabase,
  ownedMovement,
  ownedRule,
  ownedTag,
  protectTable,
} from "../../migration-helpers";

export async function up(db: MigrationDatabase) {
  await sql`CREATE TYPE finance.tag_decision_event_kind AS ENUM ('manual_tag','manual_no_tag','reset','rule_applied','rule_revalidated');
  CREATE TABLE finance.tag_decision_event (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES identity."user"(id) ON DELETE CASCADE,
    transaction_id uuid NOT NULL REFERENCES finance."transaction"(id) ON DELETE CASCADE,
    previous_tag_id uuid REFERENCES finance.tag(id) ON DELETE SET NULL,
    tag_id uuid REFERENCES finance.tag(id) ON DELETE SET NULL, rule_id uuid REFERENCES finance.tag_rule(id) ON DELETE RESTRICT,
    kind finance.tag_decision_event_kind NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
  ); CREATE INDEX tag_decision_event_transaction_id_idx ON finance.tag_decision_event(transaction_id, created_at)`.execute(
    db,
  );
  const owner = `user_id = ${currentUser}`;
  await protectTable(
    db,
    "tag_decision_event",
    owner,
    `${owner} AND ${ownedMovement("tag_decision_event.transaction_id")}
    AND (previous_tag_id IS NULL OR ${ownedTag("tag_decision_event.previous_tag_id")})
    AND (tag_id IS NULL OR ${ownedTag("tag_decision_event.tag_id")})
    AND (rule_id IS NULL OR ${ownedRule("tag_decision_event.rule_id")})`,
    true,
  );
}

export async function down(db: MigrationDatabase) {
  await sql`DROP TABLE finance.tag_decision_event; DROP TYPE finance.tag_decision_event_kind`.execute(
    db,
  );
}
