import { sql } from "kysely";
import {
  currentUser,
  type MigrationDatabase,
  ownedTag,
  protectTable,
} from "../../migration-helpers";

export async function up(db: MigrationDatabase) {
  await sql`ALTER TABLE finance.objective
    ADD COLUMN budget_version integer NOT NULL DEFAULT 1 CHECK (budget_version > 0),
    ADD COLUMN archived_at timestamptz;
    CREATE TABLE finance.budget_revision (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      objective_id uuid NOT NULL REFERENCES finance.objective(id) ON DELETE CASCADE,
      version integer NOT NULL CHECK (version > 0),
      name varchar(80) NOT NULL,
      amount numeric(15,2) NOT NULL CHECK (amount > 0),
      kind finance.objective_kind NOT NULL,
      is_recurring boolean, period finance.objective_period,
      start_date timestamptz, end_date timestamptz,
      effective_from timestamptz NOT NULL,
      recorded_at timestamptz NOT NULL DEFAULT now(),
      superseded_at timestamptz,
      UNIQUE (objective_id, version),
      CHECK ((kind = 'amount_based' AND is_recurring IS NULL AND period IS NULL AND start_date IS NULL AND end_date IS NULL)
        OR (kind = 'time_based' AND is_recurring = true AND period IS NOT NULL AND start_date IS NOT NULL)
        OR (kind = 'time_based' AND is_recurring = false AND period IS NULL AND start_date IS NOT NULL AND end_date IS NOT NULL)),
      CHECK (end_date IS NULL OR start_date IS NULL OR end_date > start_date),
      CHECK (start_date IS NULL OR effective_from >= start_date),
      CHECK (end_date IS NULL OR effective_from < end_date)
    );
    CREATE UNIQUE INDEX budget_revision_effective_idx ON finance.budget_revision(objective_id, effective_from)
      WHERE superseded_at IS NULL;
    CREATE TABLE finance.budget_revision_tag (
      revision_id uuid NOT NULL REFERENCES finance.budget_revision(id) ON DELETE CASCADE,
      tag_id uuid NOT NULL REFERENCES finance.tag(id),
      PRIMARY KEY (revision_id, tag_id)
    );
    CREATE INDEX budget_revision_tag_tag_idx ON finance.budget_revision_tag(tag_id);
    INSERT INTO finance.budget_revision
      (id, objective_id, version, name, amount, kind, is_recurring, period, start_date, end_date, effective_from)
    SELECT id, id, 1, name, amount, kind, is_recurring, period, start_date, end_date, coalesce(start_date, created_at)
      FROM finance.objective WHERE intent = 'spending';
    INSERT INTO finance.budget_revision_tag(revision_id, tag_id)
      SELECT l.objective_id, l.tag_id FROM finance.objective_tag l
      JOIN finance.objective o ON o.id = l.objective_id WHERE o.intent = 'spending';`.execute(
    db,
  );

  const ownedBudget = `EXISTS (SELECT 1 FROM finance.objective o WHERE o.id = objective_id AND o.intent = 'spending' AND o.user_id = ${currentUser})`;
  await protectTable(db, "budget_revision", ownedBudget);
  await sql`REVOKE UPDATE, DELETE ON finance.budget_revision FROM lazyfinance_runtime;
    GRANT UPDATE (superseded_at) ON finance.budget_revision TO lazyfinance_runtime;`.execute(
    db,
  );

  const ownedRevision = `EXISTS (SELECT 1 FROM finance.budget_revision r JOIN finance.objective o ON o.id = r.objective_id
    WHERE r.id = revision_id AND o.intent = 'spending' AND o.user_id = ${currentUser})`;
  await protectTable(
    db,
    "budget_revision_tag",
    ownedRevision,
    `${ownedRevision} AND ${ownedTag("tag_id")}`,
    true,
  );
}

export async function down(_db: MigrationDatabase) {
  // Collapsing revisions back to one mutable row would silently lose history.
  throw new Error(
    "Budget revision history cannot be destructively rolled back",
  );
}
