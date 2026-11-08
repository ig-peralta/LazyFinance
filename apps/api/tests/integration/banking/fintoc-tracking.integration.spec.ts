import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  fintocAppFixture,
  fintocMovementIds,
  fintocStoredAccount,
} from "../../fixtures/banking/fintoc-app";
import {
  fintocAccount,
  fintocMovement,
} from "../../fixtures/banking/fintoc-snapshot";
import { integration } from "../../fixtures/persistence";

describe.skipIf(!integration)(
  "Fintoc tracking starts at the connection's first link",
  () => {
    it("requests only the first-link booking day onward, independently of user age and old provider records", async () => {
      const f = await fintocAppFixture("2026-11-08T17:00:00.000Z");
      try {
        await f.db.update("user", f.userId, {
          createdAt: "2025-01-01T15:00:00.000Z",
        });
        f.state.movements.acc_checking.push(
          {
            ...fintocMovement,
            id: "mov_previous_day",
            post_date: "2026-11-07T00:00:00.000Z",
          },
          {
            ...fintocMovement,
            id: "mov_link_day",
            post_date: "2026-11-08T00:00:00.000Z",
          },
        );
        expect(await f.run()).toMatchObject({
          status: "complete",
          report: {
            requestedHistory: { from: "2026-11-08", through: "2026-11-08" },
            importedAccounts: 3,
            bookedMovements: 1,
            reversedMovements: 0,
            ignoredPendingMovements: 0,
            ignoredProcessingMovements: 0,
          },
        });
        const account = await fintocStoredAccount(f);
        expect(
          await f.db.rows("transaction", { accountId: account.id }),
        ).toEqual([
          expect.objectContaining({
            external_id: "mov_link_day",
            booked_on: "2026-11-08",
            amount: "-15000.00",
          }),
        ]);
        expect(account).toMatchObject({
          balance: "500000.00",
          last_synced_at: new Date(fintocAccount.refreshed_at),
        });
        expect(
          await f.db.rows("provider_movement_removal", {
            providerConnectionId: f.connected.id,
          }),
        ).toEqual([]);
        const requests = f.fetch.mock.calls
          .map(([address]) => new URL(String(address)))
          .filter((url) => url.pathname.endsWith("/movements"));
        expect(requests).toHaveLength(3);
        for (const url of requests) {
          expect(url.searchParams.get("since")).toBe("2026-11-08");
          expect(url.searchParams.get("until")).toBe("2026-11-08");
        }
      } finally {
        await f.close();
      }
    });

    it("imports reported balances with zero tracked movements without manufacturing an opening transaction or bank history", async () => {
      const f = await fintocAppFixture("2026-11-08T17:00:00.000Z");
      try {
        expect(await f.run()).toMatchObject({
          status: "complete",
          report: { bookedMovements: 0, importedAccounts: 3 },
        });
        expect(await fintocMovementIds(f)).toEqual([]);
        expect(await f.first.accounts.list.query()).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ type: "checking", balance: "500000.00" }),
            expect.objectContaining({ type: "savings", balance: "150000.00" }),
            expect.objectContaining({ type: "credit_card", balance: null }),
          ]),
        );
        expect(await f.syncStatus()).toMatchObject({
          lastResult: "complete",
          accounts: expect.arrayContaining([
            expect.objectContaining({
              type: "checking",
              historyCoverage: {
                completeness: "partial",
                from: null,
                through: null,
              },
            }),
          ]),
        });
        expect(
          await f.first.summaries.monthly.query({ month: "2026-11" }),
        ).toMatchObject({
          spending: "0.00",
          receivedIncome: "0.00",
          unresolvedMovementCount: 0,
        });
      } finally {
        await f.close();
      }
    });

    it("preserves the original first-link day through access checks, relink and later refresh", async () => {
      const f = await fintocAppFixture("2026-11-01T15:00:00.000Z");
      try {
        expect(await f.run()).toMatchObject({
          status: "complete",
          report: {
            requestedHistory: { from: "2026-11-01", through: "2026-11-08" },
          },
        });
        const ids = await fintocMovementIds(f);
        const checked = await f.first.banking.checkConnection.mutate({
          id: f.connected.id,
        });
        expect(checked.createdAt).toBe(f.connected.createdAt);
        f.state.link.link_token = `${f.state.link.id}_token_relinked`;
        const relinked = await f.connect(f.connected.id);
        expect(relinked.createdAt).toBe(f.connected.createdAt);
        f.fetch.mockClear();
        expect(await f.refresh()).toMatchObject({
          status: "complete",
          report: {
            requestedHistory: { from: "2026-11-01", through: "2026-11-08" },
          },
        });
        expect(await fintocMovementIds(f)).toEqual(ids);
        for (const [address] of f.fetch.mock.calls) {
          const url = new URL(String(address));
          if (url.pathname.endsWith("/movements"))
            expect(url.searchParams.get("since")).toBe("2026-11-01");
        }
      } finally {
        await f.close();
      }
    });

    it("does not delete, reclassify or refetch records imported before the new tracking boundary", async () => {
      const f = await fintocAppFixture("2026-11-08T17:00:00.000Z");
      try {
        await f.run();
        const account = await fintocStoredAccount(f);
        const legacy = await f.db.insert("transaction", {
          id: randomUUID(),
          accountId: account.id,
          externalId: "legacy_prelink_credit",
          amount: "5000.00",
          type: "credit",
          source: "provider",
          bookedAt: "2026-11-01T15:00:00.000Z",
          bookedOn: "2026-11-01",
          bookedPrecision: "calendar_day",
          isInternalMovement: false,
          userInternalOverride: false,
          description: "Retained earlier import",
        });
        const tag = await f.first.tags.create.mutate({
          name: "Retained decision",
        });
        await f.first.tags.decide.mutate({
          transactionId: legacy.id,
          tagId: tag.id,
        });
        const source = await f.first.income.createSource.mutate({
          name: "Retained income",
          regularity: "irregular",
          amountKind: "variable",
          startDate: "2026-01-01",
        });
        await f.first.income.confirm.mutate({
          transactionId: legacy.id,
          sourceId: source.id,
        });
        f.state.movements.acc_checking.push({
          ...fintocMovement,
          id: "legacy_prelink_credit",
          amount: 9000,
        });
        expect(await f.refresh()).toMatchObject({
          status: "complete",
          report: { bookedMovements: 0 },
        });
        expect(await f.db.rows("transaction", { id: legacy.id })).toEqual([
          expect.objectContaining({
            amount: "5000.00",
            tag_id: tag.id,
            user_internal_override: false,
            removed_at: null,
          }),
        ]);
        expect(
          await f.db.rows("income_receipt", { transactionId: legacy.id }),
        ).toHaveLength(1);
      } finally {
        await f.close();
      }
    });
  },
);
