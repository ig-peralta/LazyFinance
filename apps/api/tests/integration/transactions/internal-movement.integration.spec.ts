import { describe, expect, it } from "vitest";
import { fixture, integration, startApi } from "../../fixtures/persistence";

describe.skipIf(!integration)("user internal-movement corrections", () => {
  it("reconciles spending, budgets, retained recoveries, receipts and savings without changing bank facts", async () => {
    const f = await fixture(true),
      api = await startApi(f);
    try {
      const client = api.client(),
        other = api.client(f.otherToken);
      const tag = await client.tags.create.mutate({
        name: "Name is not classification",
      });
      const purchase = await f.db.insert("transaction", {
        accountId: f.accountId,
        tagId: tag.id,
        tagDecisionOrigin: "manual",
        amount: "-100.00",
        type: "debit",
        bookedAt: "2026-09-10T15:00:00.123456Z",
        isInternalMovement: false,
        providerInternalAssessment: "unknown",
        source: "provider",
        externalId: "purchase",
      });
      const credit = await f.db.insert("transaction", {
        accountId: f.accountId,
        amount: "30.00",
        type: "credit",
        bookedAt: "2026-09-11T15:00:00Z",
        isInternalMovement: false,
      });
      const incomeCredit = await f.db.insert("transaction", {
        accountId: f.accountId,
        amount: "50.00",
        type: "credit",
        bookedAt: "2026-09-12T15:00:00Z",
        isInternalMovement: null,
        providerInternalAssessment: "unknown",
      });
      const source = await client.income.createSource.mutate({
        name: "Income",
        currency: "CLP",
        regularity: "irregular",
        amountKind: "variable",
        expectedAmount: null,
        schedule: null,
        startDate: "2026-01-01",
        endDate: null,
      });
      const budget = await f.db.insert("objective", {
        userId: f.userId,
        name: "September",
        amount: "200.00",
        intent: "spending",
        kind: "time_based",
        isRecurring: true,
        period: "monthly",
        startDate: "2026-09-01T04:00:00Z",
      });
      await f.db.insert("objective_tag", {
        objectiveId: budget.id,
        tagId: tag.id,
      });
      const goal = await client.objectives.createSavingsGoal.mutate({
        name: "Allocation",
        amount: "100.00",
        tagIds: [tag.id],
        schedule: { period: "lifetime" },
      });
      await client.transactions.setExpenseAdjustment.mutate({
        creditTransactionId: credit.id,
        purchaseTransactionId: purchase.id,
        amount: "30.00",
        kind: "refund",
      });
      expect(
        (await client.summaries.monthly.query({ month: "2026-09" })).spending,
      ).toBe("70.00");
      const set = { id: purchase.id, isInternalMovement: true };
      expect(
        await client.transactions.setInternalMovement.mutate(set),
      ).toMatchObject({
        isInternalMovement: true,
        userInternalOverride: true,
        providerInternalAssessment: "unknown",
      });
      expect(await client.transactions.setInternalMovement.mutate(set)).toEqual(
        await client.transactions.setInternalMovement.mutate(set),
      );
      expect(
        (await client.summaries.monthly.query({ month: "2026-09" })).spending,
      ).toBe("0.00");
      expect(
        (await client.objectives.progress.query({ month: "2026-09" })).find(
          (row) => row.id === budget.id,
        )?.spent,
      ).toBe("0.00");
      expect(
        (
          await client.transactions.expenseAdjustments.query({
            transactionId: purchase.id,
          })
        ).items[0].status,
      ).toBe("needs_review");
      expect(
        (
          await client.objectives.savingsProgress.query({
            id: goal.id,
            month: "2026-09",
          })
        ).netContributions,
      ).toBe("-100.00");
      await client.transactions.setInternalMovement.mutate({
        ...set,
        isInternalMovement: false,
      });
      expect(
        (await client.summaries.monthly.query({ month: "2026-09" })).spending,
      ).toBe("70.00");
      expect(
        (await client.objectives.progress.query({ month: "2026-09" })).find(
          (row) => row.id === budget.id,
        )?.spent,
      ).toBe("70.00");
      expect(
        (
          await client.transactions.expenseAdjustments.query({
            transactionId: purchase.id,
          })
        ).items[0].status,
      ).toBe("applied");
      await client.transactions.setInternalMovement.mutate({
        id: credit.id,
        isInternalMovement: true,
      });
      expect(
        (await client.summaries.monthly.query({ month: "2026-09" })).spending,
      ).toBe("100.00");
      await client.transactions.setInternalMovement.mutate({
        id: credit.id,
        isInternalMovement: false,
      });
      await expect(
        client.income.confirm.mutate({
          transactionId: incomeCredit.id,
          sourceId: source.id,
        }),
      ).rejects.toMatchObject({ data: { code: "BAD_REQUEST" } });
      await client.transactions.setInternalMovement.mutate({
        id: incomeCredit.id,
        isInternalMovement: false,
      });
      await client.income.confirm.mutate({
        transactionId: incomeCredit.id,
        sourceId: source.id,
      });
      await client.transactions.setInternalMovement.mutate({
        id: incomeCredit.id,
        isInternalMovement: true,
      });
      expect(
        (await client.income.summary.query({ month: "2026-09" }))
          .receivedIncome,
      ).toBe("0.00");
      expect(
        await f.db.rows("income_receipt", { transactionId: incomeCredit.id }),
      ).toHaveLength(1);
      await client.transactions.setInternalMovement.mutate({
        id: incomeCredit.id,
        isInternalMovement: false,
      });
      expect(
        (await client.income.summary.query({ month: "2026-09" }))
          .receivedIncome,
      ).toBe("50.00");
      expect(
        await client.transactions.setInternalMovement.mutate({
          id: incomeCredit.id,
          isInternalMovement: null,
        }),
      ).toMatchObject({ userInternalOverride: null, isInternalMovement: null });
      await expect(
        other.transactions.setInternalMovement.mutate(set),
      ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
      const current = (await f.db.rows("transaction", { id: purchase.id }))[0];
      expect(current).toMatchObject({
        amount: purchase.amount,
        booked_at: purchase.booked_at,
        external_id: purchase.external_id,
        provider_internal_assessment: purchase.provider_internal_assessment,
        tag_id: tag.id,
      });
      expect((await f.db.rows("account", { id: f.accountId }))[0].balance).toBe(
        "500000.00",
      );
      await f.db.update("transaction", purchase.id, {
        reviewStatus: "needs_review",
      });
      expect(
        await client.transactions.setInternalMovement.mutate({
          id: purchase.id,
          isInternalMovement: false,
        }),
      ).toMatchObject({ reviewStatus: "needs_review" });
      await f.db.update("transaction", purchase.id, {
        removedAt: "2026-09-20T15:00:00Z",
        removalReason: "removed",
      });
      await expect(
        client.transactions.setInternalMovement.mutate(set),
      ).rejects.toMatchObject({ data: { code: "BAD_REQUEST" } });
    } finally {
      await api.app.close();
      await f.db.close();
    }
  });
});
