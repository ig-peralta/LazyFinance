import { sql } from "kysely";
import type { MigrationDatabase } from "../../migration-helpers";

export async function up(db: MigrationDatabase) {
  await sql`CREATE TABLE assistant.action (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES identity."user"(id),
    conversation_id uuid REFERENCES assistant.conversation(id) ON DELETE SET NULL,
    turn_id uuid,
    origin text NOT NULL CHECK (origin IN ('assistant','mcp')),
    request_id uuid NOT NULL,
    grant_id text,
    client_id text,
    version integer NOT NULL DEFAULT 1 CHECK (version > 0),
    request jsonb NOT NULL,
    command jsonb NOT NULL,
    context jsonb NOT NULL,
    fingerprint text NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
    status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','applied','cancelled','stale')),
    results jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(results)='array' AND jsonb_array_length(results)<=6),
    created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
    expires_at timestamptz NOT NULL DEFAULT (statement_timestamp()+interval '15 minutes'),
    UNIQUE(user_id,origin,request_id),
    CHECK (expires_at > created_at AND expires_at <= created_at+interval '31 days'),
    CHECK ((origin='assistant' AND turn_id IS NOT NULL AND grant_id IS NULL AND client_id IS NULL) OR
           (origin='mcp' AND conversation_id IS NULL AND turn_id IS NULL AND grant_id IS NOT NULL AND client_id IS NOT NULL AND status='applied')),
    CHECK (octet_length(request::text)+octet_length(command::text)+octet_length(context::text)+octet_length(results::text)<=65536)
  );
  CREATE INDEX action_conversation ON assistant.action(conversation_id,turn_id);
  CREATE INDEX action_owner ON assistant.action(user_id,created_at DESC);
  ALTER TABLE assistant.action ENABLE ROW LEVEL SECURITY;
  ALTER TABLE assistant.action FORCE ROW LEVEL SECURITY;
  CREATE POLICY action_owner ON assistant.action TO lazyfinance_runtime
    USING (user_id=(SELECT identity.current_user_id()))
    WITH CHECK (user_id=(SELECT identity.current_user_id()) AND (conversation_id IS NULL OR EXISTS (
      SELECT 1 FROM assistant.conversation c WHERE c.id=conversation_id AND c.user_id=(SELECT identity.current_user_id())
    )));
  GRANT SELECT, INSERT ON assistant.action TO lazyfinance_runtime;
  GRANT UPDATE(version,request,command,context,fingerprint,status,results,expires_at) ON assistant.action TO lazyfinance_runtime;
  CREATE FUNCTION assistant.protect_action_receipt() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
  BEGIN
    IF OLD.status IN ('applied','cancelled') AND (to_jsonb(NEW)-'conversation_id') IS DISTINCT FROM (to_jsonb(OLD)-'conversation_id') THEN
      RAISE EXCEPTION 'Finalized action is immutable' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END $$;
  REVOKE ALL ON FUNCTION assistant.protect_action_receipt() FROM PUBLIC;
  CREATE TRIGGER protect_action_receipt BEFORE UPDATE ON assistant.action FOR EACH ROW EXECUTE FUNCTION assistant.protect_action_receipt();`.execute(
    db,
  );
}

export async function down(): Promise<never> {
  throw new Error(
    "Financial execution receipts require an explicit retention and recovery plan",
  );
}
