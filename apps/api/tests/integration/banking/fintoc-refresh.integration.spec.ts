import type { BankingImportResult } from "@lazyfinance/contracts";
import { describe, expect, it } from "vitest";
import {
  type FintocAppFixture,
  fintocAppFixture,
  fintocMovementIds,
  fintocStoredAccount,
  fintocStoredMovement,
} from "../../fixtures/banking/fintoc-app";
import { fintocMovement } from "../../fixtures/banking/fintoc-snapshot";
import { integration } from "../../fixtures/persistence";

function signal() {
  let resolve = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function fact(f: FintocAppFixture, id: string) {
  const row = f.state.movements.acc_checking.find((row) => row.id === id);
  if (!row) throw new Error(`Missing movement fixture ${id}`);
  return row;
}

async function recognizeSalary(f: FintocAppFixture) {
  const salary = await fintocStoredMovement(f, "mov_salary");
  await f.first.transactions.setInternalMovement.mutate({
    id: salary.id,
    isInternalMovement: false,
  });
  const source = await f.first.income.createSource.mutate({
    name: "Salary",
    regularity: "irregular",
    amountKind: "variable",
    startDate: "2026-01-01",
  });
  await f.first.income.confirm.mutate({
    transactionId: salary.id,
    sourceId: source.id,
  });
  const tag = await f.persistence
    .user(f.userId)
    .tags.create.mutate({ name: "Keep this tag" });
  await f.persistence
    .user(f.userId)
    .tagRules.manual.mutate({ transactionId: salary.id, tagId: tag.id });
  return { salary, source, tag };
}

describe.skipIf(!integration)(
  "owned Fintoc refresh/recovery and durable sync reporting",
  () => {
    it("requires ownership/authentication for reads and refresh commands and never contacts the provider on status reads", async () => {
      const f = await fintocAppFixture();
      try {
        for (const result of await Promise.allSettled([
          f.client("").banking.refresh.mutate({ id: f.connected.id }),
          f.client("").banking.syncStatus.query({ id: f.connected.id }),
        ])) {
          expect(result.status).toBe("rejected");
          if (result.status === "rejected")
            expect(result.reason).toMatchObject({
              data: { code: "UNAUTHORIZED" },
            });
        }
        await expect(
          f.other.banking.refresh.mutate({ id: f.connected.id }),
        ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
        await expect(
          f.other.banking.syncStatus.query({ id: f.connected.id }),
        ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
        expect(await f.syncStatus()).toMatchObject({
          activity: "idle",
          lastSuccessAt: null,
          canRefresh: true,
          freshness: { state: "unknown" },
        });
        expect(f.fetch).not.toHaveBeenCalled();
        await f.run();
        f.fetch.mockClear();
        const before = await f.syncStatus();
        const after = await f.syncStatus();
        expect(after).toMatchObject({
          lastAttemptAt: before.lastAttemptAt,
          lastSuccessAt: before.lastSuccessAt,
          accounts: before.accounts,
          lastResult: "complete",
        });
        expect(after.accounts).toHaveLength(3);
        expect(
          after.accounts.find((row) => row.type === "credit_card"),
        ).toMatchObject({ freshness: "unknown", balanceAsOf: null });
        expect(JSON.stringify(after)).not.toMatch(
          /credential|checkpoint|link_token|token_fixture/,
        );
        expect(f.fetch).not.toHaveBeenCalled();
      } finally {
        await f.close();
      }
    });

    it("repeats a bounded snapshot refresh without duplicates and preserves classifications, receipts, aliases and independent balance time", async () => {
      const f = await fintocAppFixture();
      try {
        await f.run();
        const { salary, tag } = await recognizeSalary(f);
        const purchase = await fintocStoredMovement(f, "mov_purchase");
        await f.first.transactions.setInternalMovement.mutate({
          id: purchase.id,
          isInternalMovement: false,
        });
        await f.db.update("account", (await fintocStoredAccount(f)).id, {
          alias: "Keep this alias",
        });
        const ids = await fintocMovementIds(f);
        const sourceTime = new Date(Date.now() - 60_000).toISOString();
        f.state.accounts[0] = {
          ...f.state.accounts[0],
          balance: { current: 550_000 },
          refreshed_at: sourceTime,
        };
        fact(f, "mov_purchase").amount = -16_000;
        expect(await f.refresh()).toMatchObject({ status: "complete" });
        expect(await fintocMovementIds(f)).toEqual(ids);
        expect(await fintocStoredMovement(f, "mov_salary")).toMatchObject({
          id: salary.id,
          tag_id: tag.id,
          user_internal_override: false,
        });
        expect(
          await f.db.rows("income_receipt", { transactionId: salary.id }),
        ).toHaveLength(1);
        expect(await fintocStoredAccount(f)).toMatchObject({
          balance: "550000.00",
          last_synced_at: new Date(sourceTime),
          alias: "Keep this alias",
        });
        expect(
          await f.first.summaries.monthly.query({ month: "2026-11" }),
        ).toMatchObject({ spending: "16000.00", receivedIncome: "750000.00" });
        const success = (await f.syncStatus()).lastSuccessAt;
        f.state.movements.acc_checking = [];
        expect(await f.refresh()).toMatchObject({ status: "complete" });
        expect(await fintocStoredAccount(f)).toMatchObject({
          last_synced_at: new Date(sourceTime),
          history_from: "2026-11-01",
        });
        expect(await fintocStoredMovement(f, "mov_purchase")).toMatchObject({
          id: purchase.id,
          removed_at: null,
        });
        expect((await f.syncStatus()).lastSuccessAt).not.toBe(success);
      } finally {
        await f.close();
      }
    });

    it("coalesces simultaneous refresh commands while exposing a durable in-progress lease", async () => {
      const f = await fintocAppFixture();
      const entered = signal(),
        release = signal();
      let run: Promise<BankingImportResult> | undefined;
      try {
        await f.run();
        f.onRead.mockImplementationOnce(async () => {
          entered.resolve();
          await release.promise;
        });
        run = f.refresh();
        await entered.promise;
        const before = await f.syncStatus();
        expect(before).toMatchObject({
          activity: "in_progress",
          canRefresh: false,
        });
        f.fetch.mockClear();
        expect(await f.refresh()).toEqual({
          status: "in_progress",
          until: before.leaseExpiresAt,
        });
        expect(f.fetch).not.toHaveBeenCalled();
        expect((await f.syncStatus()).lastAttemptAt).toBe(before.lastAttemptAt);
        release.resolve();
        expect(await run).toMatchObject({ status: "complete" });
        expect(await f.syncStatus()).toMatchObject({
          activity: "idle",
          leaseExpiresAt: null,
          canRefresh: true,
        });
      } finally {
        release.resolve();
        await run?.catch(() => undefined);
        await f.close();
      }
    });

    it("recovers an expired lease and rejects the old run's late failure without replacing the newer success", async () => {
      const f = await fintocAppFixture();
      const entered = signal(),
        release = signal();
      let run: Promise<BankingImportResult> | undefined;
      try {
        await f.run();
        f.onRead.mockImplementationOnce(async () => {
          entered.resolve();
          await release.promise;
        });
        run = f.refresh();
        await entered.promise;
        await f.db.update(
          "provider_sync_state",
          f.connected.id,
          { leaseExpiresAt: new Date(Date.now() - 1).toISOString() },
          "providerConnectionId",
        );
        expect(await f.syncStatus()).toMatchObject({
          activity: "interrupted",
          canRefresh: true,
        });
        expect(await f.refresh()).toMatchObject({ status: "complete" });
        const newer = await f.syncStatus();
        f.state.failMovements = true;
        release.resolve();
        expect(await run).toEqual({ status: "superseded" });
        expect(await f.syncStatus()).toMatchObject({
          lastSuccessAt: newer.lastSuccessAt,
          failure: null,
          activity: "idle",
        });
      } finally {
        release.resolve();
        await run?.catch(() => undefined);
        await f.close();
      }
    });

    it("refuses an expired run's financial commit even before another attempt claims its revision", async () => {
      const f = await fintocAppFixture();
      try {
        await f.run();
        const good = await f.syncStatus();
        f.state.accounts[0] = {
          ...f.state.accounts[0],
          balance: { current: 700_000 },
          refreshed_at: new Date(Date.now() - 60_000).toISOString(),
        };
        f.onRead.mockImplementationOnce(async () => {
          await f.db.update(
            "provider_sync_state",
            f.connected.id,
            { leaseExpiresAt: new Date(Date.now() - 1).toISOString() },
            "providerConnectionId",
          );
        });
        expect(await f.refresh()).toEqual({ status: "superseded" });
        expect(await fintocStoredAccount(f)).toMatchObject({
          balance: "500000.00",
        });
        expect(await f.syncStatus()).toMatchObject({
          activity: "interrupted",
          lastSuccessAt: good.lastSuccessAt,
          canRefresh: true,
        });
        expect(await f.refresh()).toMatchObject({ status: "complete" });
        expect(await fintocStoredAccount(f)).toMatchObject({
          balance: "700000.00",
        });
      } finally {
        await f.close();
      }
    });

    it("honors provider backoff across requests and recovers without changing last-good facts on failure", async () => {
      const f = await fintocAppFixture();
      try {
        await f.run();
        const good = await f.syncStatus();
        f.state.failMovements = true;
        f.state.failureStatus = 429;
        f.state.retryAfter = "60";
        const failed = await f.refresh();
        expect(failed).toMatchObject({ status: "failed", reason: "retryable" });
        if (failed.status !== "failed" || !failed.retryAfter)
          throw new Error("Missing provider backoff");
        const failedStatus = await f.syncStatus();
        expect(failedStatus).toMatchObject({
          lastSuccessAt: good.lastSuccessAt,
          canRefresh: false,
          failure: { reason: "retryable" },
        });
        expect(await fintocStoredAccount(f)).toMatchObject({
          balance: "500000.00",
        });
        f.fetch.mockClear();
        expect(await f.refresh()).toEqual({
          status: "retry_later",
          retryAfter: failed.retryAfter,
        });
        expect(f.fetch).not.toHaveBeenCalled();
        expect((await f.syncStatus()).lastAttemptAt).toBe(
          failedStatus.lastAttemptAt,
        );
        await f.db.update(
          "provider_sync_state",
          f.connected.id,
          { retryAfter: new Date(Date.now() - 1).toISOString() },
          "providerConnectionId",
        );
        await f.db.update(
          "provider_account_selection",
          f.connected.id,
          { readRetryAfter: new Date(Date.now() - 1).toISOString() },
          "connectionId",
        );
        f.state.failMovements = false;
        expect(await f.refresh()).toMatchObject({ status: "complete" });
        expect(await f.syncStatus()).toMatchObject({
          canRefresh: true,
          failure: null,
        });
      } finally {
        await f.close();
      }
    });

    it.each([
      "expired",
      "revoked",
    ] as const)("reports %s access without deleting data and recovers only after owned relink", async (reason) => {
      const f = await fintocAppFixture();
      try {
        await f.run();
        const good = await f.syncStatus();
        if (reason === "expired") f.state.link.status = "login_required";
        else f.state.link.active = false;
        expect(await f.refresh()).toMatchObject({ status: "failed", reason });
        expect(await f.syncStatus()).toMatchObject({
          lifecycle: reason,
          canRefresh: false,
          lastSuccessAt: good.lastSuccessAt,
        });
        expect(await fintocStoredAccount(f)).toMatchObject({
          balance: "500000.00",
        });
        f.fetch.mockClear();
        await expect(f.refresh()).rejects.toMatchObject({
          data: { code: "CONFLICT" },
        });
        expect(f.fetch).not.toHaveBeenCalled();
        f.state.link.status = "active";
        f.state.link.active = true;
        f.state.link.link_token = `${f.state.link.id}_token_relinked`;
        await f.connect(f.connected.id);
        expect(await f.refresh()).toMatchObject({ status: "complete" });
        expect(await f.syncStatus()).toMatchObject({
          lifecycle: "active",
          canRefresh: true,
          failure: null,
        });
      } finally {
        await f.close();
      }
    });

    it("treats server API-key rejection as a retryable outage, never user revocation", async () => {
      const f = await fintocAppFixture();
      try {
        await f.run();
        f.fetch.mockClear();
        f.state.linkFailureStatus = 401;
        expect(await f.refresh()).toMatchObject({
          status: "failed",
          reason: "retryable",
        });

        expect(f.fetch).toHaveBeenCalledOnce();
        expect(await f.syncStatus()).toMatchObject({
          lifecycle: "active",
          failure: { reason: "retryable" },
        });
        f.state.linkFailureStatus = null;
        expect(await f.refresh()).toMatchObject({ status: "retry_later" });
        await f.db.update(
          "provider_sync_state",
          f.connected.id,
          { retryAfter: new Date(Date.now() - 1).toISOString() },
          "providerConnectionId",
        );
        await f.db.update(
          "provider_account_selection",
          f.connected.id,
          { readRetryAfter: new Date(Date.now() - 1).toISOString() },
          "connectionId",
        );
        expect(await f.refresh()).toMatchObject({ status: "complete" });
      } finally {
        await f.close();
      }
    });

    it("does not let an older access check reactivate a connection after a newer sync reports expired access", async () => {
      const f = await fintocAppFixture();
      const entered = signal(),
        release = signal();
      let checking:
        | ReturnType<typeof f.first.banking.checkConnection.mutate>
        | undefined;
      try {
        await f.run();
        f.onLink.mockImplementationOnce(async () => {
          entered.resolve();
          await release.promise;
        });
        checking = f.first.banking.checkConnection.mutate({
          id: f.connected.id,
        });
        await entered.promise;
        f.state.link.status = "login_required";
        expect(await f.refresh()).toMatchObject({
          status: "failed",
          reason: "expired",
        });
        release.resolve();
        await expect(checking).rejects.toMatchObject({
          data: { code: "CONFLICT" },
        });
        expect(await f.syncStatus()).toMatchObject({
          lifecycle: "expired",
          canRefresh: false,
        });
      } finally {
        release.resolve();
        await checking?.catch(() => undefined);
        await f.close();
      }
    });

    it.each([
      "pending",
      "processing",
    ] as const)("suspends a previously booked %s credit, retains decisions and automatically recovers only its provider suspension", async (temporary) => {
      const f = await fintocAppFixture();
      try {
        await f.run();
        const { salary, tag, source } = await recognizeSalary(f);
        if (temporary === "pending") fact(f, "mov_salary").pending = true;
        else fact(f, "mov_salary").status = "processing";
        expect(await f.refresh()).toMatchObject({
          status: "needs_review",
          conflictCount: 1,
        });
        expect(await f.syncStatus()).toMatchObject({
          providerSuspensionCount: 1,
        });
        expect(await fintocStoredMovement(f, "mov_salary")).toMatchObject({
          id: salary.id,
          amount: "750000.00",
          tag_id: tag.id,
          review_status: "needs_review",
          user_internal_override: false,
          removed_at: null,
        });
        expect(
          await f.db.rows("income_receipt", { transactionId: salary.id }),
        ).toHaveLength(1);
        expect(
          await f.first.summaries.monthly.query({ month: "2026-11" }),
        ).toMatchObject({ receivedIncome: "0.00" });
        await f.first.transactions.setInternalMovement.mutate({
          id: salary.id,
          isInternalMovement: false,
        });
        expect(await fintocStoredMovement(f, "mov_salary")).toMatchObject({
          review_status: "needs_review",
        });
        await expect(
          f.first.income.confirm.mutate({
            transactionId: salary.id,
            sourceId: source.id,
          }),
        ).rejects.toMatchObject({ data: { code: "BAD_REQUEST" } });
        fact(f, "mov_salary").pending = false;
        fact(f, "mov_salary").status = "confirmed";
        expect(await f.refresh()).toMatchObject({
          status: "complete",
          conflictCount: 0,
        });
        expect(await f.syncStatus()).toMatchObject({
          providerSuspensionCount: 0,
        });
        expect(await fintocStoredMovement(f, "mov_salary")).toMatchObject({
          id: salary.id,
          tag_id: tag.id,
          review_status: "clear",
          user_internal_override: false,
        });
        expect(
          await f.first.summaries.monthly.query({ month: "2026-11" }),
        ).toMatchObject({ receivedIncome: "750000.00" });
        expect(
          (
            await f.db.rows("provider_movement_conflict", {
              transactionId: salary.id,
              reason: "provider_unbooked",
            })
          )[0].resolved_at,
        ).not.toBeNull();
      } finally {
        await f.close();
      }
    });

    it.each([
      "mov_purchase",
      "mov_salary",
    ] as const)("replaces a temporary suspension with a terminal reversal for %s without resurrecting it", async (externalId) => {
      const f = await fintocAppFixture();
      try {
        await f.run();
        const hasReceipt = externalId === "mov_salary";
        if (hasReceipt) await recognizeSalary(f);
        const before = await fintocStoredMovement(f, externalId);
        fact(f, externalId).pending = true;
        expect(await f.refresh()).toMatchObject({
          status: "needs_review",
          conflictCount: 1,
        });
        fact(f, externalId).status = "reversed";
        const result = {
          status: hasReceipt ? "needs_review" : "complete",
          conflictCount: hasReceipt ? 1 : 0,
        };
        expect(await f.refresh()).toMatchObject(result);
        expect(await f.syncStatus()).toMatchObject({
          providerSuspensionCount: 0,
          unresolvedConflictCount: result.conflictCount,
        });
        const removed = await fintocStoredMovement(f, externalId);
        expect(removed).toMatchObject({
          id: before.id,
          tag_id: before.tag_id,
          removal_reason: "reversed",
        });
        expect(removed.removed_at).not.toBeNull();
        expect(
          (
            await f.db.rows("provider_movement_conflict", {
              transactionId: before.id,
              reason: "provider_unbooked",
            })
          )[0].resolved_at,
        ).not.toBeNull();
        fact(f, externalId).pending = false;
        fact(f, externalId).status = "confirmed";
        expect(await f.refresh()).toMatchObject(result);
        expect(await fintocStoredMovement(f, externalId)).toMatchObject({
          id: before.id,
          removed_at: removed.removed_at,
        });
        expect(
          await f.db.rows("income_receipt", { transactionId: before.id }),
        ).toHaveLength(hasReceipt ? 1 : 0);
        expect(
          await f.first.summaries.monthly.query({ month: "2026-11" }),
        ).toMatchObject({ receivedIncome: "0.00" });
      } finally {
        await f.close();
      }
    });

    it("does not clear an incompatible receipt correction when a temporary provider suspension recovers", async () => {
      const f = await fintocAppFixture();
      try {
        await f.run();
        const { salary, tag } = await recognizeSalary(f);
        fact(f, "mov_salary").status = "processing";
        await f.refresh();
        fact(f, "mov_salary").status = "confirmed";
        fact(f, "mov_salary").amount = -1;
        expect(await f.refresh()).toMatchObject({
          status: "needs_review",
          conflictCount: 1,
        });
        expect(
          (
            await f.db.rows("provider_movement_conflict", {
              transactionId: salary.id,
              reason: "provider_unbooked",
            })
          )[0].resolved_at,
        ).not.toBeNull();
        expect(
          (
            await f.db.rows("provider_movement_conflict", {
              transactionId: salary.id,
              reason: "receipt_incompatible",
            })
          )[0].resolved_at,
        ).toBeNull();
        fact(f, "mov_salary").amount = 750_000;
        expect(await f.refresh()).toMatchObject({
          status: "needs_review",
          conflictCount: 1,
        });
        expect(await fintocStoredMovement(f, "mov_salary")).toMatchObject({
          tag_id: tag.id,
          review_status: "needs_review",
        });
        await f.first.transactions.setInternalMovement.mutate({
          id: salary.id,
          isInternalMovement: false,
        });
        expect(await f.refresh()).toMatchObject({
          status: "complete",
          conflictCount: 0,
        });
        expect(
          await f.first.summaries.monthly.query({ month: "2026-11" }),
        ).toMatchObject({ receivedIncome: "750000.00" });
      } finally {
        await f.close();
      }
    });

    it("retains refund allocations while a purchase is temporarily unbooked and restores only eligible recovery", async () => {
      const f = await fintocAppFixture();
      try {
        f.state.movements.acc_checking.push({
          ...fintocMovement,
          id: "mov_refund",
          amount: 5000,
          post_date: "2026-11-02T00:00:00.000Z",
        });
        await f.run();
        const purchase = await fintocStoredMovement(f, "mov_purchase"),
          credit = await fintocStoredMovement(f, "mov_refund");
        for (const id of [purchase.id, credit.id])
          await f.first.transactions.setInternalMovement.mutate({
            id,
            isInternalMovement: false,
          });
        await f.first.transactions.setExpenseAdjustment.mutate({
          purchaseTransactionId: purchase.id,
          creditTransactionId: credit.id,
          kind: "refund",
          amount: "5000.00",
        });
        expect(
          await f.first.summaries.monthly.query({ month: "2026-11" }),
        ).toMatchObject({ spending: "10000.00" });
        fact(f, "mov_purchase").status = "processing";
        await f.refresh();
        expect(
          await f.first.summaries.monthly.query({ month: "2026-11" }),
        ).toMatchObject({ spending: "0.00" });
        expect(
          await f.db.rows("expense_adjustment", {
            purchaseTransactionId: purchase.id,
            creditTransactionId: credit.id,
          }),
        ).toHaveLength(1);
        fact(f, "mov_purchase").status = "confirmed";
        expect(await f.refresh()).toMatchObject({ status: "complete" });
        expect(
          await f.first.summaries.monthly.query({ month: "2026-11" }),
        ).toMatchObject({ spending: "10000.00" });
        expect(
          await f.db.rows("expense_adjustment", {
            purchaseTransactionId: purchase.id,
            creditTransactionId: credit.id,
          }),
        ).toHaveLength(1);
      } finally {
        await f.close();
      }
    });
  },
);
