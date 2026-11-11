import { describe, expect, it, vi } from "vitest";
import { BankingIngestionService } from "../../../src/banking/ingestion/banking-ingestion.service";
import {
  fintocStoredAccount as account,
  fintocStoredMovement as movement,
  fintocMovementIds as movementIds,
  fintocAppFixture as setup,
} from "../../fixtures/banking/fintoc-app";
import {
  fintocAccount,
  fintocMovement,
} from "../../fixtures/banking/fintoc-snapshot";
import { integration } from "../../fixtures/persistence";

describe.skipIf(!integration)(
  "owned Fintoc first import through public/private RPC and PostgreSQL",
  () => {
    it("reconciles reported cash, unknown card debt, partial history, uncertain spending and explicitly recognized income; repeat import preserves decisions", async () => {
      const f = await setup();
      try {
        expect(await f.run()).toMatchObject({
          status: "complete",
          report: {
            importedAccounts: 3,
            bookedMovements: 7,
            ignoredPendingMovements: 1,
            ignoredProcessingMovements: 1,
            reversedMovements: 1,
            uncertainMovements: 7,
            unknownCardBalances: ["acc_card"],
            skippedAccounts: [],
          },
        });
        expect(await f.first.accounts.list.query()).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ type: "checking", balance: "500000.00" }),
            expect.objectContaining({ type: "savings", balance: "150000.00" }),
            expect.objectContaining({ type: "credit_card", balance: null }),
          ]),
        );
        expect(await account(f)).toMatchObject({
          history_completeness: "partial",
          history_from: "2026-11-01",
          last_synced_at: new Date(fintocAccount.refreshed_at),
        });
        expect(await movement(f, "mov_purchase")).toMatchObject({
          amount: "-15000.00",
          booked_on: "2026-11-01",
          booked_precision: "calendar_day",
          booked_at: new Date("2026-11-01T15:00:00Z"),
          merchant: null,
          is_internal_movement: null,
        });
        expect(
          await f.first.summaries.monthly.query({ month: "2026-11" }),
        ).toMatchObject({
          spending: "0.00",
          receivedIncome: "0.00",
          unresolvedMovementCount: 7,
        });
        expect(
          await f.db.rows("income_receipt", {
            transactionId: (await movement(f, "mov_salary")).id,
          }),
        ).toEqual([]);

        const purchase = await movement(f, "mov_purchase"),
          salary = await movement(f, "mov_salary"),
          charge = await movement(f, "mov_charge", "acc_card");
        for (const id of [purchase.id, salary.id, charge.id])
          await f.first.transactions.setInternalMovement.mutate({
            id,
            isInternalMovement: false,
          });
        for (const [id, owner] of [
          ["mov_own_transfer", "acc_checking"],
          ["mov_transfer_in", "acc_savings"],
          ["mov_card_payment", "acc_checking"],
          ["mov_payment", "acc_card"],
        ])
          await f.first.transactions.setInternalMovement.mutate({
            id: (await movement(f, id, owner)).id,
            isInternalMovement: true,
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
          .tags.create.mutate({ name: "Personal" });
        await f.persistence.user(f.userId).tagRules.manual.mutate({
          transactionId: purchase.id,
          tagId: tag.id,
        });
        await f.db.update("account", (await account(f)).id, {
          alias: "Keep this alias",
        });
        const ids = await movementIds(f);
        expect(await f.run()).toMatchObject({
          status: "complete",
          conflictCount: 0,
        });
        expect(await movementIds(f)).toEqual(ids);
        expect(await movement(f, "mov_purchase")).toMatchObject({
          id: purchase.id,
          tag_id: tag.id,
          user_internal_override: false,
        });
        expect(await account(f)).toMatchObject({
          alias: "Keep this alias",
          balance: "500000.00",
        });
        expect(
          await f.db.rows("income_receipt", { transactionId: salary.id }),
        ).toHaveLength(1);
        expect(
          await f.first.summaries.monthly.query({ month: "2026-11" }),
        ).toMatchObject({
          spending: "17000.00",
          receivedIncome: "750000.00",
          unresolvedMovementCount: 0,
        });

        // A compatible provider correction changes the confirmed receipt's
        // current amount, never the separately reported source balance.
        const salaryFact = f.state.movements.acc_checking.find(
          (row) => row.id === "mov_salary",
        );
        if (!salaryFact) throw new Error("Missing salary fixture");
        salaryFact.amount = 800_000;
        expect(await f.run()).toMatchObject({
          status: "complete",
          conflictCount: 0,
        });
        expect(
          await f.first.summaries.monthly.query({ month: "2026-11" }),
        ).toMatchObject({ receivedIncome: "800000.00", spending: "17000.00" });
        expect(await account(f)).toMatchObject({ balance: "500000.00" });
        salaryFact.status = "reversed";
        expect(await f.run()).toMatchObject({
          status: "needs_review",
          conflictCount: 1,
        });
        expect(
          await f.db.rows("income_receipt", { transactionId: salary.id }),
        ).toHaveLength(1);
        expect(
          await f.first.summaries.monthly.query({ month: "2026-11" }),
        ).toMatchObject({ receivedIncome: "0.00", spending: "17000.00" });
        expect(await movement(f, "mov_purchase")).toMatchObject({
          tag_id: tag.id,
          user_internal_override: false,
        });
      } finally {
        await f.close();
      }
    });

    it("rejects anonymous/foreign references before provider I/O and never leaks credentials in results", async () => {
      const f = await setup();
      try {
        await expect(
          f.client("").banking.importInitial.mutate({ id: f.connected.id }),
        ).rejects.toMatchObject({ data: { code: "UNAUTHORIZED" } });
        await expect(
          f.other.banking.importInitial.mutate({ id: f.connected.id }),
        ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
        expect(f.fetch).not.toHaveBeenCalled();
        const result = await f.run();
        expect(JSON.stringify(result)).not.toMatch(
          /link_token|credential|token_fixture|sk_test|checkpoint/,
        );
        expect(await f.other.accounts.list.query()).toEqual([]);
        expect(await f.other.transactions.list.query({})).toMatchObject({
          items: [],
        });
      } finally {
        await f.close();
      }
    });

    it("never commits inventory or an early movement page after a later failure, and retains last-good source facts on retry", async () => {
      const f = await setup();
      try {
        f.state.movements.acc_checking = Array.from(
          { length: 301 },
          (_, i) => ({ ...fintocMovement, id: `mov_${i}` }),
        );
        f.onRead.mockImplementation(async (url) => {
          if (
            url.pathname.endsWith("/movements") &&
            url.searchParams.get("page") === "2"
          )
            f.state.failMovements = true;
        });
        expect(await f.run()).toMatchObject({
          status: "failed",
          reason: "retryable",
        });
        expect(
          await f.db.rows("account", { providerConnectionId: f.connected.id }),
        ).toEqual([]);
        const failed = (
          await f.db.rows("provider_sync_state", {
            providerConnectionId: f.connected.id,
          })
        )[0];
        expect(failed.last_success_at).toBeNull();
        expect(failed.checkpoint).toBeNull();
        f.onRead.mockReset();
        f.state.failMovements = false;
        expect(await f.run()).toMatchObject({ status: "retry_later" });
        // Advance only the disposable fixture's waiting period; production
        // recovery cannot bypass persisted application/provider backoff.
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
        expect(await f.run()).toMatchObject({ status: "complete" });
        const good = (
          await f.db.rows("provider_sync_state", {
            providerConnectionId: f.connected.id,
          })
        )[0];
        f.state.accounts[0] = {
          ...fintocAccount,
          balance: { current: 1_000_000 },
          refreshed_at: "2026-11-09T14:00:00.000Z",
        };
        f.state.invalidMovement = true;
        expect(await f.run()).toMatchObject({
          status: "failed",
          reason: "invalid_data",
        });
        expect(await account(f)).toMatchObject({
          balance: "500000.00",
          last_synced_at: new Date(fintocAccount.refreshed_at),
        });
        expect(
          (
            await f.db.rows("provider_sync_state", {
              providerConnectionId: f.connected.id,
            })
          )[0],
        ).toMatchObject({
          checkpoint: good.checkpoint,
          last_success_at: good.last_success_at,
        });
      } finally {
        await f.close();
      }
    });

    it("preserves known balances/freshness on older or undated source snapshots and does not infer deletions from missing history", async () => {
      const f = await setup();
      try {
        await f.run();
        const purchase = await movement(f, "mov_purchase");
        for (const refreshed_at of ["2026-11-07T14:00:00.000Z", null]) {
          f.state.accounts[0] = {
            ...fintocAccount,
            refreshed_at,
            balance: { current: 1 },
          };
          f.state.movements.acc_checking = [];
          expect(await f.run()).toMatchObject({ status: "complete" });
          expect(await account(f)).toMatchObject({
            balance: "500000.00",
            last_synced_at: new Date(fintocAccount.refreshed_at),
          });
          expect(await movement(f, "mov_purchase")).toMatchObject({
            id: purchase.id,
            removed_at: null,
          });
        }
      } finally {
        await f.close();
      }
    });

    it("rejects a relink in the secret-read/begin gap without fetching the old token or recording a new attempt", async () => {
      const f = await setup();
      const ingestion = f.app.get(BankingIngestionService);
      const original = ingestion.syncForUser.bind(ingestion);
      try {
        vi.spyOn(ingestion, "syncForUser").mockImplementationOnce(
          async (...args) => {
            f.state.link.link_token = `${f.state.link.id}_token_new`;
            await f.connect(f.connected.id);
            f.fetch.mockClear();
            return original(...args);
          },
        );
        expect(await f.run()).toEqual({ status: "superseded" });
        expect(f.fetch).not.toHaveBeenCalled();
        expect(
          await f.db.rows("provider_sync_state", {
            providerConnectionId: f.connected.id,
          }),
        ).toEqual([]);
        const current = await f.persistence
          .user(f.userId)
          .providerLinks.connection.query({ id: f.connected.id });
        await expect(
          f.persistence.user(f.userId).providerSync.begin.mutate({
            connectionId: f.connected.id,
            provider: "fintoc",
          }),
        ).rejects.toThrow("credential snapshot");
        expect(current.version).toBe(1);
      } finally {
        vi.restoreAllMocks();
        await f.close();
      }
    });

    it.each([
      "relink",
      "disconnect",
    ] as const)("supersedes a %s during provider I/O without writing financial data", async (action) => {
      const f = await setup();
      try {
        f.onRead.mockImplementationOnce(async () => {
          if (action === "relink") {
            f.state.link.link_token = `${f.state.link.id}_token_new`;
            await f.connect(f.connected.id);
          } else
            await f.first.banking.disconnect.mutate({ id: f.connected.id });
        });
        expect(await f.run()).toEqual({ status: "superseded" });
        expect(
          await f.db.rows("account", { providerConnectionId: f.connected.id }),
        ).toEqual([]);
        expect(
          (
            await f.db.rows("provider_sync_state", {
              providerConnectionId: f.connected.id,
            })
          )[0].last_success_at,
        ).toBeNull();
      } finally {
        await f.close();
      }
    });
  },
);
