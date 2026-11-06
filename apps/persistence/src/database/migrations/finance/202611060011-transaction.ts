import { sql } from "kysely";
import {
  type MigrationDatabase,
  ownedAccount,
  ownedRule,
  ownedTag,
  protectTable,
} from "../../migration-helpers";

export async function up(db: MigrationDatabase) {
  await sql`CREATE TYPE finance.transaction_type AS ENUM ('debit','credit');
  CREATE TYPE finance.booked_precision AS ENUM ('instant','calendar_day');
  CREATE TYPE finance.provider_internal_assessment AS ENUM ('internal','external','unknown');
  CREATE TYPE finance.movement_relation AS ENUM ('transfer_pair','card_payment_pair','reversal');
  CREATE TYPE finance.movement_removal_reason AS ENUM ('removed','reversed');
  CREATE TYPE finance.movement_review_status AS ENUM ('clear','needs_review');
  CREATE TYPE finance.tag_decision_origin AS ENUM ('unreviewed','manual','rule');
  CREATE TABLE finance."transaction" (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL REFERENCES finance.account(id) ON DELETE CASCADE,
    tag_id uuid REFERENCES finance.tag(id) ON DELETE SET NULL,
    tag_decision_origin finance.tag_decision_origin NOT NULL DEFAULT 'unreviewed',
    tag_rule_id uuid REFERENCES finance.tag_rule(id) ON DELETE RESTRICT, tag_decided_at timestamptz,
    booked_at timestamptz NOT NULL, booked_precision finance.booked_precision NOT NULL DEFAULT 'instant', booked_on date,
    amount numeric(15,2) NOT NULL CHECK (amount != 0), type finance.transaction_type NOT NULL,
    source varchar(16) NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','provider')),
    merchant varchar(120), description varchar(240), external_id varchar(512),
    provider_updated_at timestamptz, provider_observed_at timestamptz, provider_kind varchar(32),
    relation_kind finance.movement_relation, related_account_external_id varchar(512), related_movement_external_id varchar(512),
    counterparty_holder jsonb, is_internal_movement boolean,
    provider_internal_assessment finance.provider_internal_assessment NOT NULL DEFAULT 'unknown', user_internal_override boolean,
    review_status finance.movement_review_status NOT NULL DEFAULT 'clear', removed_at timestamptz,
    removal_reason finance.movement_removal_reason, created_at timestamptz NOT NULL DEFAULT now(),
    CHECK ((type = 'debit' AND amount < 0) OR (type = 'credit' AND amount > 0)),
    CHECK ((tag_decision_origin = 'unreviewed' AND tag_id IS NULL AND tag_rule_id IS NULL)
      OR (tag_decision_origin = 'manual' AND tag_rule_id IS NULL)
      OR (tag_decision_origin = 'rule' AND tag_id IS NOT NULL AND tag_rule_id IS NOT NULL)),
    CHECK ((booked_precision = 'instant' AND booked_on IS NULL) OR (booked_precision = 'calendar_day' AND booked_on IS NOT NULL)),
    CHECK ((relation_kind IS NULL AND related_account_external_id IS NULL AND related_movement_external_id IS NULL)
      OR (relation_kind IS NOT NULL AND related_account_external_id IS NOT NULL AND related_movement_external_id IS NOT NULL)),
    CHECK ((removed_at IS NULL AND removal_reason IS NULL) OR (removed_at IS NOT NULL AND removal_reason IS NOT NULL))
  );
  CREATE UNIQUE INDEX transaction_account_external_uniq ON finance."transaction"(account_id, external_id) WHERE external_id IS NOT NULL;
  CREATE INDEX transaction_account_booked_idx ON finance."transaction"(account_id, booked_at);
  CREATE INDEX transaction_tag_id_idx ON finance."transaction"(tag_id);
  `.execute(db);
  const owner = ownedAccount('"transaction".account_id');
  await protectTable(
    db,
    "transaction",
    owner,
    `${owner} AND (tag_id IS NULL OR ${ownedTag('"transaction".tag_id')})
    AND (tag_rule_id IS NULL OR ${ownedRule('"transaction".tag_rule_id')})`,
  );
}

export async function down(db: MigrationDatabase) {
  await sql`DROP TABLE finance."transaction"; DROP TYPE finance.transaction_type, finance.booked_precision,
    finance.provider_internal_assessment, finance.movement_relation, finance.movement_removal_reason,
    finance.movement_review_status, finance.tag_decision_origin`.execute(db);
}
