import { describe, expect, it } from "vitest";
import { IncomeService } from "../../../src/income/income.service";
import { fixture, integration } from "../../fixtures/persistence";

describe.skipIf(!integration)(
  "normalized storage through signed factual reads",
  () => {
    it("preserves unknown balances/decisions but excludes unresolved and removed financial facts", async () => {
      const f = await fixture(true);

      try {
        await f.db.update("account", f.accountId, {
          balance: null,
          externalId: "same-number",
          number: "****1234",
        });
        await f.db.update("account", f.otherAccountId, {
          externalId: "same-number",
          number: "****1234",
          balance: "999.00",
        });
        expect(
          await f.persistence.user(f.userId).accounts.listActive.query(),
        ).toEqual([
          expect.objectContaining({ id: f.accountId, balance: null }),
        ]);
        const tag = await f.persistence
          .user(f.userId)
          .tags.create.mutate({ name: "Personal" });
        const row = await f.db.insert("transaction", {
          accountId: f.accountId,
          externalId: "credit",
          source: "provider",
          bookedAt: new Date("2026-10-15T15:00:00Z"),
          bookedPrecision: "calendar_day",
          bookedOn: "2026-10-15",
          amount: "500.00",
          type: "credit",
          tagId: tag.id,
          tagDecisionOrigin: "manual",
          isInternalMovement: null,
        });
        const income = new IncomeService(f.persistence),
          asOf = new Date("2026-10-20T18:00:00Z");
        expect(
          await income.getSummaryForUser(f.userId, "2026-10", asOf),
        ).toMatchObject({
          unclassifiedCredits: { amount: "0.00", count: 0 },
          unresolvedMovementCount: 1,
        });
        const source = await income.createSourceForUser(f.userId, {
          name: "Confirmed",
          regularity: "irregular",
          amountKind: "variable",
          startDate: "2026-01-01",
        });
        await expect(
          income.confirmReceiptForUser(
            f.userId,
            row.id,
            { sourceId: source.id },
            asOf,
          ),
        ).rejects.toThrow("Received income requires");
        await f.db.update("transaction", row.id, {
          isInternalMovement: false,
          userInternalOverride: false,
        });
        await income.confirmReceiptForUser(
          f.userId,
          row.id,
          { sourceId: source.id },
          asOf,
        );
        expect(
          await income.getSummaryForUser(f.userId, "2026-10", asOf),
        ).toMatchObject({
          receivedIncome: "500.00",
          unresolvedMovementCount: 0,
        });
        await f.db.update("transaction", row.id, {
          removedAt: new Date("2026-10-19T18:00:00Z"),
          removalReason: "reversed",
        });
        await expect(
          income.confirmReceiptForUser(
            f.userId,
            row.id,
            { sourceId: source.id },
            asOf,
          ),
        ).rejects.toThrow("Received income requires");
        expect(
          await income.getSummaryForUser(f.userId, "2026-10", asOf),
        ).toMatchObject({ receivedIncome: "0.00", unresolvedMovementCount: 0 });
        expect(
          await f.persistence.user(f.userId).transactions.recent.query(),
        ).toEqual([]);
        expect(
          await income.listReceiptsForUser(f.userId, "2026-10", asOf),
        ).toEqual([]);
        expect(
          (await f.db.rows("transaction", { id: row.id }))[0],
        ).toMatchObject({
          tag_id: tag.id,
          user_internal_override: false,
          removal_reason: "reversed",
        });
        expect(
          await f.db.rows("income_receipt", { transactionId: row.id }),
        ).toHaveLength(1);
      } finally {
        await f.db.close();
      }
    });
  },
);
