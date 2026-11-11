import { sql } from "kysely";
import {
  currentUser,
  type MigrationDatabase,
  ownedConnection,
  protectTable,
} from "../../migration-helpers";

export async function up(db: MigrationDatabase) {
  await sql`CREATE TABLE finance.provider_account_selection (
    connection_id uuid PRIMARY KEY REFERENCES finance.provider_connection(id),
    user_id uuid NOT NULL REFERENCES identity."user"(id),
    version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
    discovery_version integer NOT NULL DEFAULT 0 CHECK (discovery_version >= 0),
    credential_version integer,
    discovered_at timestamptz,
    read_retry_after timestamptz,
    accounts jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(accounts) = 'array' AND jsonb_array_length(accounts) <= 1000 AND octet_length(accounts::text) <= 524288),
    account_ids text[] NOT NULL DEFAULT '{}' CHECK (cardinality(account_ids) <= 1000),
    confirmed_at timestamptz,
    automatic_enrolled boolean NOT NULL DEFAULT false
  );
  CREATE INDEX provider_account_selection_owner ON finance.provider_account_selection(user_id);
  CREATE TABLE finance.provider_sync_schedule (
    connection_id uuid PRIMARY KEY REFERENCES finance.provider_connection(id),
    user_id uuid NOT NULL REFERENCES identity."user"(id),
    mode finance.connection_mode NOT NULL,
    credential_version integer NOT NULL,
    selection_version integer NOT NULL,
    eligible boolean NOT NULL DEFAULT false,
    next_attempt_at timestamptz,
    failure_count integer NOT NULL DEFAULT 0 CHECK (failure_count >= 0),
    pause_reason text CHECK (pause_reason IN ('selection_required','no_accounts','access','invalid_data','account_unavailable','repeated_failure')),
    claim_id uuid,
    claim_expires_at timestamptz,
    run_revision integer,
    attempts timestamptz[] NOT NULL DEFAULT '{}' CHECK (cardinality(attempts) <= 30),
    CHECK ((claim_id IS NULL) = (claim_expires_at IS NULL))
  );
  CREATE INDEX provider_sync_schedule_due ON finance.provider_sync_schedule(next_attempt_at, connection_id) WHERE eligible;
  CREATE INDEX provider_sync_schedule_owner ON finance.provider_sync_schedule(user_id);
  CREATE TABLE finance.provider_request_admission (
    id uuid PRIMARY KEY,
    mode finance.connection_mode NOT NULL,
    purpose text NOT NULL CHECK (purpose IN ('sync','lifecycle')),
    started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    expires_at timestamptz NOT NULL DEFAULT (clock_timestamp() + interval '25 seconds'),
    finished_at timestamptz,
    CHECK (expires_at > started_at AND expires_at <= started_at + interval '30 seconds')
  );
  CREATE INDEX provider_request_admission_started ON finance.provider_request_admission(started_at);
  CREATE TABLE finance.provider_request_backoff (
    mode finance.connection_mode PRIMARY KEY,
    retry_after timestamptz NOT NULL
  );
  ALTER TABLE finance.provider_sync_state
    ADD COLUMN credential_version integer,
    ADD COLUMN selection_version integer,
    ADD COLUMN claim_id uuid;
  ALTER TYPE finance.provider_sync_failure ADD VALUE 'account_unavailable';`.execute(
    db,
  );

  await protectTable(
    db,
    "provider_account_selection",
    `user_id = ${currentUser}`,
    `user_id = ${currentUser} AND ${ownedConnection("provider_account_selection.connection_id")}`,
  );
  await protectTable(
    db,
    "provider_sync_schedule",
    `user_id = ${currentUser}`,
    `user_id = ${currentUser} AND ${ownedConnection("provider_sync_schedule.connection_id")}`,
  );
  await sql`REVOKE DELETE ON finance.provider_account_selection, finance.provider_sync_schedule FROM lazyfinance_runtime;
    CREATE POLICY schedule_claim_read ON finance.provider_sync_schedule FOR SELECT TO lazyfinance_runtime
      USING (current_setting('lazyfinance.context_kind', true) = 'banking-scheduler');
    CREATE POLICY schedule_claim_update ON finance.provider_sync_schedule FOR UPDATE TO lazyfinance_runtime
      USING (current_setting('lazyfinance.context_kind', true) = 'banking-scheduler')
      WITH CHECK (current_setting('lazyfinance.context_kind', true) = 'banking-scheduler');
    CREATE FUNCTION finance.protect_provider_operational_owner() RETURNS trigger
      LANGUAGE plpgsql SET search_path = pg_catalog AS $$
      BEGIN
        IF NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.connection_id IS DISTINCT FROM OLD.connection_id THEN
          RAISE EXCEPTION 'Immutable banking owner' USING ERRCODE = '42501';
        END IF;
        IF current_setting('lazyfinance.context_kind', true) = 'banking-scheduler'
          AND (to_jsonb(NEW) - ARRAY['claim_id','claim_expires_at']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['claim_id','claim_expires_at']) THEN
          RAISE EXCEPTION 'Scheduler may only claim work' USING ERRCODE = '42501';
        END IF;
        RETURN NEW;
      END $$;
    CREATE TRIGGER provider_selection_owner BEFORE UPDATE ON finance.provider_account_selection
      FOR EACH ROW EXECUTE FUNCTION finance.protect_provider_operational_owner();
    CREATE TRIGGER provider_schedule_owner BEFORE UPDATE ON finance.provider_sync_schedule
      FOR EACH ROW EXECUTE FUNCTION finance.protect_provider_operational_owner();
    ALTER TABLE finance.provider_request_admission ENABLE ROW LEVEL SECURITY;
    ALTER TABLE finance.provider_request_admission FORCE ROW LEVEL SECURITY;
    CREATE POLICY request_admission ON finance.provider_request_admission TO lazyfinance_runtime
      USING (current_setting('lazyfinance.context_kind', true) = 'banking-transport')
      WITH CHECK (current_setting('lazyfinance.context_kind', true) = 'banking-transport');
    GRANT SELECT, INSERT, DELETE ON finance.provider_request_admission TO lazyfinance_runtime;
    GRANT UPDATE (finished_at) ON finance.provider_request_admission TO lazyfinance_runtime;
    ALTER TABLE finance.provider_request_backoff ENABLE ROW LEVEL SECURITY;
    ALTER TABLE finance.provider_request_backoff FORCE ROW LEVEL SECURITY;
    CREATE POLICY request_backoff ON finance.provider_request_backoff TO lazyfinance_runtime
      USING (current_setting('lazyfinance.context_kind', true) = 'banking-transport')
      WITH CHECK (current_setting('lazyfinance.context_kind', true) = 'banking-transport');
    GRANT SELECT, INSERT ON finance.provider_request_backoff TO lazyfinance_runtime;
    GRANT UPDATE (retry_after) ON finance.provider_request_backoff TO lazyfinance_runtime;
  `.execute(db);
}

export async function down(): Promise<never> {
  throw new Error(
    "Selection consent and durable banking work require an explicit recovery plan",
  );
}
