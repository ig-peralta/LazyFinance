import { randomUUID } from "node:crypto";
import type {
  BankingAutomation,
  BankingSelection,
} from "@lazyfinance/contracts";
import type { ProviderScheduleCompletion } from "@lazyfinance/contracts/internal";
import { Inject, Injectable } from "@nestjs/common";
import { TRPCError } from "@trpc/server";
import { type Kysely, sql } from "kysely";
import { RLS_DB } from "../../database/tokens";
import type { FinanceTables } from "../finance.tables";

@Injectable()
export class ProviderScheduleRepository {
  constructor(@Inject(RLS_DB) private readonly db: Kysely<FinanceTables>) {}

  async status(
    id: string,
    selection: BankingSelection,
  ): Promise<BankingAutomation> {
    const row = await this.db
      .selectFrom("finance.provider_sync_schedule")
      .selectAll()
      .where("connectionId", "=", id)
      .executeTakeFirst();
    return {
      enrolled: selection.automaticEnrolled,
      selectedAccounts: selection.accountIds.length,
      nextAttemptAt: row?.nextAttemptAt?.toISOString() ?? null,
      failureCount: row?.failureCount ?? 0,
      pauseReason:
        row?.pauseReason ??
        (!selection.confirmedAt
          ? "selection_required"
          : !selection.accountIds.length
            ? "no_accounts"
            : null),
    };
  }

  /** Called only inside the normal owned mutation transaction, never by the scheduler. */
  async refreshConnection(id: string) {
    const row = await this.db
      .selectFrom("finance.provider_connection as c")
      .innerJoin("finance.provider as p", "p.id", "c.providerId")
      .innerJoin(
        "finance.provider_account_selection as s",
        "s.connectionId",
        "c.id",
      )
      .select([
        "c.id",
        "c.userId",
        "c.mode",
        "c.credentialVersion",
        "c.status",
        "c.disconnectedAt",
        "s.version",
        "s.accountIds",
        "s.automaticEnrolled",
        "s.confirmedAt",
      ])
      .where("c.id", "=", id)
      .where("p.identifier", "=", "fintoc")
      .executeTakeFirst();
    if (!row || !row.mode) return;
    const existing = await this.db
      .selectFrom("finance.provider_sync_schedule")
      .selectAll()
      .where("connectionId", "=", id)
      .forUpdate()
      .executeTakeFirst();
    const retainedPause =
      existing?.pauseReason &&
      ["invalid_data", "account_unavailable", "repeated_failure"].includes(
        existing.pauseReason,
      )
        ? existing.pauseReason
        : null;
    const pauseReason =
      row.disconnectedAt || row.status !== "active"
        ? ("access" as const)
        : !row.confirmedAt
          ? ("selection_required" as const)
          : !row.accountIds.length
            ? ("no_accounts" as const)
            : retainedPause;
    const eligible = row.automaticEnrolled && pauseReason === null;
    const nextAttemptAt = pauseReason
      ? null
      : new Date(Math.max(Date.now(), existing?.nextAttemptAt?.getTime() ?? 0));
    const values = {
      credentialVersion: row.credentialVersion,
      selectionVersion: row.version,
      eligible,
      pauseReason,
      nextAttemptAt,
      claimId: null,
      claimExpiresAt: null,
      runRevision: null,
    };
    await this.db
      .insertInto("finance.provider_sync_schedule")
      .values({
        ...values,
        connectionId: id,
        userId: row.userId,
        mode: row.mode,
      })
      .onConflict((oc) => oc.column("connectionId").doUpdateSet(values))
      .execute();
  }

  async claim(mode: "test" | "live") {
    // Operational-only lock: no user lock or provider call while it is held.
    await sql`select pg_advisory_xact_lock(hashtextextended('lazyfinance:banking-scheduler', 0))`.execute(
      this.db,
    );
    const now = new Date();
    const active = await this.db
      .selectFrom("finance.provider_sync_schedule")
      .select("connectionId")
      .where("claimExpiresAt", ">", now)
      .limit(1)
      .executeTakeFirst();
    if (active) return null;
    const row = await this.db
      .selectFrom("finance.provider_sync_schedule")
      .selectAll()
      .where("mode", "=", mode)
      .where("eligible", "=", true)
      .where("nextAttemptAt", "<=", now)
      .orderBy("nextAttemptAt")
      .orderBy("connectionId")
      .limit(1)
      .forUpdate()
      .skipLocked()
      .executeTakeFirst();
    if (!row) return null;
    const id = randomUUID(),
      expiresAt = new Date(now.getTime() + 5 * 60_000);
    await this.db
      .updateTable("finance.provider_sync_schedule")
      .set({ claimId: id, claimExpiresAt: expiresAt })
      .where("connectionId", "=", row.connectionId)
      .execute();
    return {
      id,
      userId: row.userId,
      connectionId: row.connectionId,
      mode: row.mode,
      credentialVersion: row.credentialVersion,
      selectionVersion: row.selectionVersion,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async begin(
    id: string,
    revision: number,
    leaseExpiresAt: Date,
    claimId?: string,
  ) {
    // Serialize claim extension with global capacity observation. A row lock
    // alone cannot hide an old expired MVCC tuple from another scheduler.
    if (claimId)
      await sql`select pg_advisory_xact_lock(hashtextextended('lazyfinance:banking-scheduler', 0))`.execute(
        this.db,
      );
    const row = await this.db
      .selectFrom("finance.provider_sync_schedule")
      .selectAll()
      .where("connectionId", "=", id)
      .forUpdate()
      .executeTakeFirstOrThrow();
    const now = new Date();
    if (
      claimId &&
      (row.claimId !== claimId ||
        !row.claimExpiresAt ||
        row.claimExpiresAt <= now ||
        !row.eligible)
    )
      throw new TRPCError({
        code: "CONFLICT",
        message: "Background work was superseded",
      });
    const attempts = row.attempts.filter(
      (at) => at.getTime() > now.getTime() - 24 * 60 * 60_000,
    );
    if (attempts.length >= 30) {
      const retryAt = new Date(
        Math.min(...attempts.map((at) => at.getTime())) + 24 * 60 * 60_000,
      );
      await this.db
        .updateTable("finance.provider_sync_schedule")
        .set({
          nextAttemptAt: retryAt,
          claimId: null,
          claimExpiresAt: null,
          runRevision: null,
        })
        .where("connectionId", "=", id)
        .execute();
      return retryAt;
    }
    await this.db
      .updateTable("finance.provider_sync_schedule")
      .set({
        attempts: [...attempts, now],
        runRevision: revision,
        nextAttemptAt: new Date(
          Math.max(row.nextAttemptAt?.getTime() ?? 0, leaseExpiresAt.getTime()),
        ),
        ...(claimId ? { claimExpiresAt: leaseExpiresAt } : {}),
        ...(!claimId ? { claimId: null, claimExpiresAt: null } : {}),
      })
      .where("connectionId", "=", id)
      .execute();
    return null;
  }

  async deferRead(id: string, retryAt: Date) {
    // Keep existing claims/runs intact; only postpone new eligible work.
    await this.db
      .updateTable("finance.provider_sync_schedule")
      .set({ nextAttemptAt: sql<Date>`greatest(next_attempt_at, ${retryAt})` })
      .where("connectionId", "=", id)
      .where("pauseReason", "is", null)
      .execute();
  }

  async matchesRun(
    id: string,
    revision: number,
    claimId: string | null,
    lock = false,
  ) {
    let query = this.db
      .selectFrom("finance.provider_sync_schedule")
      .select(["runRevision", "claimId", "claimExpiresAt"])
      .where("connectionId", "=", id);
    if (lock) query = query.forUpdate();
    const row = await query.executeTakeFirst();
    return (
      !!row &&
      row.runRevision === revision &&
      row.claimId === claimId &&
      (!claimId ||
        (!!row.claimExpiresAt && row.claimExpiresAt.getTime() > Date.now()))
    );
  }

  async assertRun(id: string, revision: number, claimId: string | null) {
    if (!(await this.matchesRun(id, revision, claimId)))
      throw new TRPCError({
        code: "CONFLICT",
        message: "Synchronization claim was superseded",
      });
  }

  async finish(
    id: string,
    revision: number,
    claimId: string | null,
    completion: ProviderScheduleCompletion,
    failure?: string,
  ) {
    const row = await this.db
      .selectFrom("finance.provider_sync_schedule")
      .selectAll()
      .where("connectionId", "=", id)
      .forUpdate()
      .executeTakeFirstOrThrow();
    if (
      row.runRevision !== revision ||
      row.claimId !== claimId ||
      row.failureCount !== completion.expectedFailureCount ||
      (claimId &&
        (!row.claimExpiresAt || row.claimExpiresAt.getTime() <= Date.now()))
    )
      throw new TRPCError({
        code: "CONFLICT",
        message: "Synchronization schedule changed",
      });
    const failureCount = failure ? row.failureCount + 1 : 0;
    const pauseReason: BankingAutomation["pauseReason"] = !failure
      ? null
      : failure === "expired" || failure === "revoked"
        ? "access"
        : failure === "invalid_data" || failure === "account_unavailable"
          ? failure
          : failureCount >= 5
            ? "repeated_failure"
            : null;
    const nextAttemptAt = completion.nextAttemptAt
      ? new Date(completion.nextAttemptAt)
      : null;
    if (
      (!failure || failure === "retryable") &&
      (!nextAttemptAt || nextAttemptAt.getTime() <= Date.now())
    )
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "A future synchronization time is required",
      });
    const selected = await this.db
      .selectFrom("finance.provider_account_selection")
      .select(["automaticEnrolled", "accountIds"])
      .where("connectionId", "=", id)
      .executeTakeFirstOrThrow();
    await this.db
      .updateTable("finance.provider_sync_schedule")
      .set({
        failureCount,
        pauseReason,
        nextAttemptAt: pauseReason ? null : nextAttemptAt,
        eligible:
          selected.automaticEnrolled &&
          selected.accountIds.length > 0 &&
          pauseReason === null,
        claimId: null,
        claimExpiresAt: null,
        runRevision: null,
      })
      .where("connectionId", "=", id)
      .execute();
  }
}
