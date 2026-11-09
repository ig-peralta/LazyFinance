import { sql } from "kysely";
import type { MigrationDatabase } from "../../migration-helpers";

export async function up(db: MigrationDatabase) {
  await sql`CREATE SCHEMA assistant;
  REVOKE ALL ON SCHEMA assistant FROM PUBLIC;
  GRANT USAGE ON SCHEMA assistant TO lazyfinance_runtime;
  CREATE TABLE assistant.conversation (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES identity."user"(id),
    title text NOT NULL DEFAULT 'Nueva conversación' CHECK (length(title) BETWEEN 1 AND 80),
    turns jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(turns) = 'array' AND jsonb_array_length(turns) <= 24 AND octet_length(turns::text) <= 786432),
    lease uuid,
    lease_expires_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),
    expires_at timestamptz NOT NULL DEFAULT (statement_timestamp() + interval '30 days'),
    CHECK ((lease IS NULL) = (lease_expires_at IS NULL)),
    CHECK (expires_at > created_at AND expires_at <= created_at + interval '30 days')
  );
  CREATE INDEX conversation_owner ON assistant.conversation(user_id, updated_at DESC);
  ALTER TABLE assistant.conversation ENABLE ROW LEVEL SECURITY;
  ALTER TABLE assistant.conversation FORCE ROW LEVEL SECURITY;
  CREATE POLICY assistant_owner ON assistant.conversation TO lazyfinance_runtime
    USING (user_id = (SELECT identity.current_user_id()))
    WITH CHECK (user_id = (SELECT identity.current_user_id()));
  GRANT SELECT, INSERT, DELETE ON assistant.conversation TO lazyfinance_runtime;
  GRANT UPDATE (title, turns, lease, lease_expires_at, updated_at) ON assistant.conversation TO lazyfinance_runtime;`.execute(
    db,
  );
}

export async function down(): Promise<never> {
  throw new Error(
    "Conversation history requires an explicit retention and recovery plan",
  );
}
