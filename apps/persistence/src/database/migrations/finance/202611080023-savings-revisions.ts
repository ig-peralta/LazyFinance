import { sql } from "kysely";
import {
  currentUser,
  type MigrationDatabase,
  ownedTag,
  protectTable,
} from "../../migration-helpers";

export async function up(db: MigrationDatabase) {
  await sql`ALTER TABLE finance.objective ADD COLUMN goal_version integer NOT NULL DEFAULT 1 CHECK (goal_version > 0);
    CREATE TABLE finance.savings_revision (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      objective_id uuid NOT NULL REFERENCES finance.objective(id),
      version integer NOT NULL CHECK (version > 0), name varchar(80) NOT NULL,
      amount numeric(15,2) NOT NULL CHECK (amount > 0),
      kind finance.objective_kind NOT NULL, is_recurring boolean, period finance.objective_period,
      start_date timestamptz, end_date timestamptz, recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      UNIQUE(objective_id,version),
      CHECK ((kind = 'amount_based' AND is_recurring IS NULL AND period IS NULL AND start_date IS NULL AND end_date IS NULL)
        OR (kind = 'time_based' AND is_recurring = true AND period IS NOT NULL AND start_date IS NOT NULL)
        OR (kind = 'time_based' AND is_recurring = false AND period IS NULL AND start_date IS NOT NULL AND end_date IS NOT NULL)),
      CHECK (end_date IS NULL OR start_date IS NULL OR end_date > start_date)
    );
    CREATE TABLE finance.savings_revision_tag (
      revision_id uuid NOT NULL REFERENCES finance.savings_revision(id), tag_id uuid NOT NULL REFERENCES finance.tag(id),
      PRIMARY KEY(revision_id,tag_id)
    );
    CREATE INDEX savings_revision_tag_tag_idx ON finance.savings_revision_tag(tag_id);
    INSERT INTO finance.savings_revision(id,objective_id,version,name,amount,kind,is_recurring,period,start_date,end_date,recorded_at)
      SELECT id,id,1,name,amount,kind,is_recurring,period,start_date,end_date,created_at FROM finance.objective WHERE intent='saving';
    INSERT INTO finance.savings_revision_tag(revision_id,tag_id)
      SELECT l.objective_id,l.tag_id FROM finance.objective_tag l JOIN finance.objective o ON o.id=l.objective_id WHERE o.intent='saving';`.execute(
    db,
  );
  const owned = `EXISTS (SELECT 1 FROM finance.objective o WHERE o.id = objective_id AND o.intent = 'saving' AND o.user_id = ${currentUser})`;
  await protectTable(db, "savings_revision", owned, owned, true);
  const revision = `EXISTS (SELECT 1 FROM finance.savings_revision r JOIN finance.objective o ON o.id=r.objective_id WHERE r.id=revision_id AND o.intent='saving' AND o.user_id=${currentUser})`;
  await protectTable(
    db,
    "savings_revision_tag",
    revision,
    `${revision} AND ${ownedTag("tag_id")}`,
    true,
  );
}

export async function down(_db: MigrationDatabase) {
  throw new Error(
    "Savings revision history cannot be destructively rolled back",
  );
}
