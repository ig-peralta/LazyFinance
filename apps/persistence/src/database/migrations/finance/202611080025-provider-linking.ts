import { sql } from "kysely";
import {
  currentUser,
  type MigrationDatabase,
  ownedConnection,
  protectTable,
} from "../../migration-helpers";

export async function up(db: MigrationDatabase) {
  await sql`INSERT INTO finance.provider (identifier) VALUES ('fintoc') ON CONFLICT (identifier) DO NOTHING;
    ALTER TABLE finance.provider_connection
      ADD COLUMN external_id varchar(100),
      ADD COLUMN encrypted_credential text,
      ADD COLUMN credential_version integer NOT NULL DEFAULT 0 CHECK (credential_version >= 0),
      ADD COLUMN holder_type text CHECK (holder_type IN ('individual','business')),
      ADD COLUMN institution_id varchar(100),
      ADD COLUMN institution_name varchar(200),
      ADD COLUMN disconnected_at timestamptz,
      ADD COLUMN disconnect_pending boolean NOT NULL DEFAULT false,
      ADD CONSTRAINT provider_link_identity UNIQUE (provider_id, mode, external_id),
      ADD CONSTRAINT provider_link_fields CHECK (external_id IS NULL OR
        (mode IS NOT NULL AND holder_type IS NOT NULL AND institution_id IS NOT NULL AND institution_name IS NOT NULL));
    CREATE TABLE finance.provider_link_intent (
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES identity."user"(id),
      provider_intent_id varchar(100) NOT NULL UNIQUE,
      mode finance.connection_mode NOT NULL,
      holder_type text NOT NULL CHECK (holder_type IN ('individual','business')),
      connection_id uuid REFERENCES finance.provider_connection(id),
      expected_version integer,
      state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','processing','completed','failed')),
      exchange_token_hash varchar(64),
      completed_connection_id uuid REFERENCES finance.provider_connection(id),
      created_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL DEFAULT (now() + interval '20 minutes'),
      CHECK ((connection_id IS NULL) = (expected_version IS NULL)),
      CHECK ((state = 'completed') = (completed_connection_id IS NOT NULL))
    );
    CREATE INDEX provider_link_intent_owner_idx ON finance.provider_link_intent(user_id);
    CREATE INDEX provider_link_intent_connection_idx ON finance.provider_link_intent(connection_id);
    CREATE INDEX provider_link_intent_completed_idx ON finance.provider_link_intent(completed_connection_id);
  `.execute(db);
  await protectTable(
    db,
    "provider_link_intent",
    `user_id = ${currentUser}`,
    `user_id = ${currentUser}
      AND (connection_id IS NULL OR ${ownedConnection("provider_link_intent.connection_id")})
      AND (completed_connection_id IS NULL OR ${ownedConnection("provider_link_intent.completed_connection_id")})`,
  );
  await sql`REVOKE DELETE ON finance.provider_link_intent FROM lazyfinance_runtime`.execute(
    db,
  );
}

export async function down(): Promise<never> {
  throw new Error(
    "Banking credentials and connection history require an explicit recovery plan",
  );
}
