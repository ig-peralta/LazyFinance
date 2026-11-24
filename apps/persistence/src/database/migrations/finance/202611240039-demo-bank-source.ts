import { sql } from "kysely";
import {
  currentUser,
  type MigrationDatabase,
  ownedConnection,
} from "../../migration-helpers";

export async function up(db: MigrationDatabase) {
  await sql`INSERT INTO finance.provider (identifier) VALUES ('mock_bank')
    ON CONFLICT (identifier) DO NOTHING;

    CREATE TABLE finance.demo_bank_source (
      connection_id uuid PRIMARY KEY REFERENCES finance.provider_connection(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES identity."user"(id),
      accounts jsonb NOT NULL CHECK (jsonb_typeof(accounts) = 'array' AND jsonb_array_length(accounts) = 6),
      movements jsonb NOT NULL CHECK (jsonb_typeof(movements) = 'array' AND jsonb_array_length(movements) <= 50000 AND octet_length(movements::text) <= 16777216),
      failure text CHECK (failure IN ('retryable', 'expired')),
      prepared boolean NOT NULL DEFAULT false,
      fixture_as_of timestamptz NOT NULL,
      initial_movement_count integer NOT NULL CHECK (initial_movement_count >= 0),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX demo_bank_source_owner ON finance.demo_bank_source(user_id);
    ALTER TABLE finance.demo_bank_source ENABLE ROW LEVEL SECURITY;
    ALTER TABLE finance.demo_bank_source FORCE ROW LEVEL SECURITY;

    CREATE TABLE finance.demo_bank_sync_event (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      connection_id uuid NOT NULL REFERENCES finance.provider_connection(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES identity."user"(id),
      occurred_at timestamptz NOT NULL,
      origin text NOT NULL CHECK (origin IN ('generated', 'executed')),
      result text NOT NULL CHECK (result IN ('complete', 'needs_review', 'failed')),
      movement_count integer NOT NULL CHECK (movement_count >= 0),
      failure_reason text
    );
    CREATE INDEX demo_bank_sync_event_history ON finance.demo_bank_sync_event(connection_id, occurred_at DESC);
    ALTER TABLE finance.demo_bank_sync_event ENABLE ROW LEVEL SECURITY;
    ALTER TABLE finance.demo_bank_sync_event FORCE ROW LEVEL SECURITY;
    CREATE POLICY demo_bank_event_insert ON finance.demo_bank_sync_event
      FOR INSERT TO lazyfinance_runtime WITH CHECK (
        user_id = ${sql.raw(currentUser)} AND origin = 'executed'
        AND ${sql.raw(ownedConnection("demo_bank_sync_event.connection_id"))}
        AND EXISTS (SELECT 1 FROM finance.provider_connection c
          JOIN finance.provider p ON p.id = c.provider_id
          WHERE c.id = connection_id AND p.identifier = 'mock_bank')
      );
    GRANT INSERT ON finance.demo_bank_sync_event TO lazyfinance_runtime;
  `.execute(db);
  // Only the dedicated, non-production demo login can read or change the
  // simulated provider's source. The runtime login gets no table privileges.
}

export async function down(db: MigrationDatabase) {
  await sql`DROP TABLE finance.demo_bank_sync_event;
    DROP TABLE finance.demo_bank_source;
    DELETE FROM finance.provider p WHERE p.identifier = 'mock_bank'
      AND NOT EXISTS (SELECT 1 FROM finance.provider_connection c WHERE c.provider_id = p.id);`.execute(
    db,
  );
}
