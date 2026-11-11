import type { AcquireProviderRequest } from "@lazyfinance/contracts/internal";
import { Inject, Injectable } from "@nestjs/common";
import { type Kysely, sql } from "kysely";
import { RLS_DB } from "../../database/tokens";
import type { FinanceTables } from "../finance.tables";

@Injectable()
export class ProviderRequestRepository {
  constructor(@Inject(RLS_DB) private readonly db: Kysely<FinanceTables>) {}

  async acquire(input: AcquireProviderRequest) {
    await sql`select pg_advisory_xact_lock(hashtextextended('lazyfinance:fintoc-requests', 0))`.execute(
      this.db,
    );
    const now = new Date();
    const backoff = await this.db
      .selectFrom("finance.provider_request_backoff")
      .select("retryAfter")
      .where("mode", "=", input.mode)
      .executeTakeFirst();
    if (backoff && backoff.retryAfter > now)
      return {
        acquired: false as const,
        retryAt: backoff.retryAfter.toISOString(),
      };
    await this.db
      .deleteFrom("finance.provider_request_admission")
      .where(
        "id",
        "in",
        this.db
          .selectFrom("finance.provider_request_admission")
          .select("id")
          .where("startedAt", "<=", new Date(now.getTime() - 3_600_000))
          .limit(1000),
      )
      .execute();
    const stats = await this.db
      .selectFrom("finance.provider_request_admission")
      .select([
        sql<number>`count(*) FILTER (WHERE started_at > ${new Date(now.getTime() - 1000)})::int`.as(
          "recentCount",
        ),
        sql<Date | null>`min(started_at) FILTER (WHERE started_at > ${new Date(now.getTime() - 1000)})`.as(
          "recentAt",
        ),
        sql<number>`count(*) FILTER (WHERE finished_at IS NULL AND expires_at > ${now})::int`.as(
          "activeCount",
        ),
        sql<Date | null>`min(expires_at) FILTER (WHERE finished_at IS NULL AND expires_at > ${now})`.as(
          "activeUntil",
        ),
        sql<number>`count(*) FILTER (WHERE mode = ${input.mode} AND purpose = 'sync')::int`.as(
          "readCount",
        ),
        sql<Date | null>`min(started_at) FILTER (WHERE mode = ${input.mode} AND purpose = 'sync')`.as(
          "firstReadAt",
        ),
      ])
      .where("startedAt", ">", new Date(now.getTime() - 3_600_000))
      .executeTakeFirstOrThrow();
    let retryAt = now.getTime();
    if (stats.recentCount >= 2 && stats.recentAt)
      retryAt = Math.max(retryAt, stats.recentAt.getTime() + 1000);
    if (stats.activeCount >= 2 && stats.activeUntil)
      retryAt = Math.max(
        retryAt,
        Math.min(stats.activeUntil.getTime(), now.getTime() + 250),
      );
    if (
      input.purpose === "sync" &&
      stats.readCount >= 1000 &&
      stats.firstReadAt
    )
      retryAt = Math.max(retryAt, stats.firstReadAt.getTime() + 3_600_000);
    if (retryAt > now.getTime())
      return {
        acquired: false as const,
        retryAt: new Date(retryAt).toISOString(),
      };
    const expiresAt = new Date(now.getTime() + 25_000);
    await this.db
      .insertInto("finance.provider_request_admission")
      .values({ ...input, startedAt: now, expiresAt })
      .execute();
    return { acquired: true as const, expiresAt: expiresAt.toISOString() };
  }

  async release(id: string) {
    await this.db
      .updateTable("finance.provider_request_admission")
      .set({ finishedAt: sql<Date>`clock_timestamp()` })
      .where("id", "=", id)
      .where("finishedAt", "is", null)
      .execute();
    return { released: true };
  }

  async defer(mode: "test" | "live", retryAfter: string) {
    await this.db
      .insertInto("finance.provider_request_backoff")
      .values({ mode, retryAfter: new Date(retryAfter) })
      .onConflict((oc) =>
        oc.column("mode").doUpdateSet({
          retryAfter: sql<Date>`greatest(finance.provider_request_backoff.retry_after, ${new Date(retryAfter)})`,
        }),
      )
      .execute();
    return { released: true };
  }
}
