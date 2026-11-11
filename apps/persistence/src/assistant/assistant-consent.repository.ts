import type { DecideAssistantConsent } from "@lazyfinance/contracts";
import { StoredAssistantConsentSchema } from "@lazyfinance/contracts/internal";
import { Inject, Injectable } from "@nestjs/common";
import { TRPCError } from "@trpc/server";
import { type Kysely, sql } from "kysely";
import { RLS_DB } from "../database/tokens";
import { wireValue } from "../serialization";
import type { AssistantTables } from "./assistant.tables";

@Injectable()
export class AssistantConsentRepository {
  constructor(@Inject(RLS_DB) private readonly db: Kysely<AssistantTables>) {}

  async get() {
    const row = await this.db
      .selectFrom("assistant.processing_consent")
      .select(["policyKey", "decision", "revision", "decidedAt"])
      .executeTakeFirst();
    return row ? StoredAssistantConsentSchema.parse(wireValue(row)) : null;
  }

  // User mutations are serialized by the shared RLS middleware advisory lock.
  async decide(input: DecideAssistantConsent) {
    const current = await this.get();
    if ((current?.revision ?? 0) !== input.expectedRevision)
      throw new TRPCError({ code: "CONFLICT", message: "Consent changed" });
    if (
      current?.policyKey === input.policyKey &&
      current.decision === input.decision
    )
      return current;
    const values = {
      policyKey: input.policyKey,
      decision: input.decision,
      revision: input.expectedRevision + 1,
      decidedAt: sql<Date>`statement_timestamp()`,
    };
    const row = current
      ? await this.db
          .updateTable("assistant.processing_consent")
          .set(values)
          .where("userId", "=", sql<string>`identity.current_user_id()`)
          .where("revision", "=", input.expectedRevision)
          .returning(["policyKey", "decision", "revision", "decidedAt"])
          .executeTakeFirstOrThrow()
      : await this.db
          .insertInto("assistant.processing_consent")
          .values({
            ...values,
            userId: sql<string>`identity.current_user_id()`,
          })
          .returning(["policyKey", "decision", "revision", "decidedAt"])
          .executeTakeFirstOrThrow();
    return StoredAssistantConsentSchema.parse(wireValue(row));
  }
}
