import { sql } from "kysely";
import type { MigrationDatabase } from "../../migration-helpers";

export async function up(db: MigrationDatabase) {
  await sql`ALTER TABLE assistant.conversation
    ADD COLUMN mode text NOT NULL DEFAULT 'text' CHECK (mode IN ('text', 'voice'));
    ALTER TABLE assistant.conversation NO FORCE ROW LEVEL SECURITY;
    UPDATE assistant.conversation SET mode = 'voice'
      WHERE jsonb_array_length(turns) > 0
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(turns) AS turn
        WHERE NOT (turn ? 'voice') AND turn->>'question' <> 'Consulta por voz'
      );
    ALTER TABLE assistant.conversation FORCE ROW LEVEL SECURITY;
    CREATE INDEX conversation_mode_owner ON assistant.conversation(user_id, mode, updated_at DESC);
  `.execute(db);
}

export async function down(): Promise<never> {
  throw new Error(
    "Conversation mode isolation requires an explicit recovery plan",
  );
}
