import {
  type FinishOnboarding,
  OnboardingStateSchema,
} from "@lazyfinance/contracts";
import { Inject, Injectable } from "@nestjs/common";
import { type Kysely, sql } from "kysely";
import { RLS_DB } from "../../database/tokens";
import { wireValue } from "../../serialization";
import type { OnboardingTables } from "./onboarding.tables";

@Injectable()
export class OnboardingRepository {
  constructor(@Inject(RLS_DB) private readonly db: Kysely<OnboardingTables>) {}

  async state() {
    const row = await this.db
      .selectFrom("identity.onboarding")
      .select(["status", "completedAt"])
      .executeTakeFirst();
    return OnboardingStateSchema.parse(
      row ? wireValue(row) : { status: "active", completedAt: null },
    );
  }

  async finish({ status }: FinishOnboarding) {
    const row = await this.db
      .insertInto("identity.onboarding")
      .values({
        userId: sql<string>`identity.current_user_id()`,
        status,
        completedAt:
          status === "completed" ? sql<Date>`clock_timestamp()` : null,
      })
      .onConflict((oc) =>
        oc.column("userId").doUpdateSet({
          // Row-level upsert serialization also protects concurrent first writes.
          status: sql`case when identity.onboarding.status = 'completed' then 'completed' else excluded.status end`,
          completedAt: sql`coalesce(identity.onboarding.completed_at, excluded.completed_at)`,
        }),
      )
      .returning(["status", "completedAt"])
      .executeTakeFirstOrThrow();
    return OnboardingStateSchema.parse(wireValue(row));
  }
}
