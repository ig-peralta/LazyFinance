import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  type Fixture,
  fixture,
  integration,
  startApi,
} from "../../fixtures/persistence";

async function movement(
  f: Fixture,
  amount: string,
  bookedAt: string,
  accountId = f.accountId,
  tagId: string | null = null,
) {
  return f.db.insert("transaction", {
    accountId,
    amount,
    bookedAt,
    type: amount.startsWith("-") ? "debit" : "credit",
    tagId,
    tagDecisionOrigin: tagId ? "manual" : "unreviewed",
    isInternalMovement: false,
    reviewStatus: "clear",
  });
}

describe.skipIf(!integration)(
  "purchase-attributed refunds and expense reimbursements",
  () => {
    it("reconciles gross/net spending, archived budgets, credit-period receipts and MCP without rewriting bank facts", async () => {
      const f = await fixture(true);
      const api = await startApi(f, true);
      try {
        const client = api.client();
        const tag = await client.tags.create.mutate({ name: "Purchases" });
        const otherTag = await client.tags.create.mutate({
          name: "Credit tag is not attribution",
        });
        const purchase = await movement(
          f,
          "-100000.00",
          "2026-10-15T15:00:00.123456Z",
          f.accountId,
          tag.id,
        );
        const refund = await movement(
          f,
          "30000.00",
          "2026-11-02T15:00:00Z",
          f.accountId,
          otherTag.id,
        );
        const reimbursement = await movement(
          f,
          "20000.00",
          "2026-11-03T15:00:00Z",
        );
        await movement(
          f,
          "-50000.00",
          "2026-11-04T15:00:00Z",
          f.accountId,
          tag.id,
        );
        const budgetId = randomUUID();
        await f.db.insert("objective", {
          id: budgetId,
          userId: f.userId,
          name: "October budget",
          amount: "280000.00",
          kind: "time_based",
          intent: "spending",
          isRecurring: true,
          period: "monthly",
          startDate: "2026-10-01T03:00:00Z",
          archivedAt: "2026-11-01T03:00:00Z",
        });
        await f.db.insert("budget_revision", {
          id: budgetId,
          objectiveId: budgetId,
          version: 1,
          name: "October budget",
          amount: "280000.00",
          kind: "time_based",
          isRecurring: true,
          period: "monthly",
          startDate: "2026-10-01T03:00:00Z",
          effectiveFrom: "2026-10-01T03:00:00Z",
        });
        await f.db.insert("budget_revision_tag", {
          revisionId: budgetId,
          tagId: tag.id,
        });
        const bankFacts = await f.db.rows("transaction", {
          accountId: f.accountId,
        });
        // A provider's reversal hint is not user confirmation.
        await f.db.update("transaction", refund.id, {
          providerKind: "reversal",
          relationKind: "reversal",
          relatedAccountExternalId: "account",
          relatedMovementExternalId: "purchase",
        });
        expect(
          await client.summaries.monthly.query({ month: "2026-10" }),
        ).toMatchObject({
          grossSpending: "100000.00",
          spending: "100000.00",
          refunds: "0.00",
        });
        const pair = {
          creditTransactionId: refund.id,
          purchaseTransactionId: purchase.id,
          kind: "refund" as const,
          amount: "30000",
        };
        const first =
          await client.transactions.setExpenseAdjustment.mutate(pair);
        expect(first).toMatchObject({
          status: "applied",
          amount: "30000.00",
          purchaseTag: { id: tag.id },
          purchaseBookedAt: "2026-10-15T15:00:00.123456Z",
        });
        expect(
          await client.transactions.setExpenseAdjustment.mutate(pair),
        ).toEqual(first);
        await client.transactions.setExpenseAdjustment.mutate({
          creditTransactionId: reimbursement.id,
          purchaseTransactionId: purchase.id,
          amount: "20000.00",
          kind: "reimbursement",
        });
        const october = await client.summaries.monthly.query({
          month: "2026-10",
        });
        expect(october).toMatchObject({
          grossSpending: "100000.00",
          refunds: "30000.00",
          reimbursements: "20000.00",
          spending: "50000.00",
          receivedIncome: "0.00",
          recoveredExpenseCredits: { amount: "0.00", count: 0 },
          tags: [
            {
              id: tag.id,
              count: 1,
              grossAmount: "100000.00",
              refunds: "30000.00",
              reimbursements: "20000.00",
              amount: "50000.00",
            },
          ],
        });
        expect(
          (await client.objectives.progress.query({ month: "2026-10" })).find(
            (budget) => budget.id === budgetId,
          ),
        ).toMatchObject({
          grossSpent: "100000.00",
          refunds: "30000.00",
          reimbursements: "20000.00",
          spent: "50000.00",
          remaining: "230000.00",
          tracking: { archivedAt: "2026-11-01T03:00:00.000000Z" },
        });
        expect(
          await client.objectives.progress.query({ month: "2026-11" }),
        ).toEqual([]);
        expect(
          await client.summaries.monthly.query({ month: "2026-11" }),
        ).toMatchObject({
          grossSpending: "50000.00",
          spending: "50000.00",
          refunds: "0.00",
          reimbursements: "0.00",
          recoveredExpenseCredits: {
            amount: "50000.00",
            count: 2,
            needsReviewCount: 0,
          },
          unclassifiedCredits: { amount: "0.00", count: 0 },
          receivedIncome: "0.00",
        });
        expect(
          await client.income.summary.query({ month: "2026-11" }),
        ).toMatchObject({
          receivedIncome: "0.00",
          unclassifiedCredits: { amount: "0.00", count: 0 },
          recoveredExpenseCredits: { amount: "50000.00", count: 2 },
        });
        const comparison = await client.summaries.comparison.query({
          month: "2026-10",
        });
        expect(comparison.spending).toEqual({
          current: "50000.00",
          previous: "0.00",
          change: "50000.00",
        });
        const mcp = await fetch(`${api.url}/mcp`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${f.token}`,
            "content-type": "application/json",
            accept: "application/json, text/event-stream",
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: {
              name: "consultar_resumen_gastos_mensuales",
              arguments: { month: "2026-10" },
            },
          }),
        });
        expect(mcp.status).toBe(200);
        expect((await mcp.json()).result.structuredContent).toMatchObject({
          grossSpending: october.grossSpending,
          refunds: october.refunds,
          reimbursements: october.reimbursements,
          spending: october.spending,
          tags: october.tags,
        });
        const finalRefund = await movement(
          f,
          "50000.00",
          "2026-11-04T16:00:00Z",
        );
        await client.transactions.setExpenseAdjustment.mutate({
          ...pair,
          creditTransactionId: finalRefund.id,
          amount: "50000",
        });
        expect(
          await client.summaries.monthly.query({ month: "2026-10" }),
        ).toMatchObject({
          spending: "0.00",
          grossSpending: "100000.00",
          refunds: "80000.00",
          reimbursements: "20000.00",
        });
        const after = await f.db.rows("transaction", {
          accountId: f.accountId,
        });
        for (const original of bankFacts)
          expect(after.find((row) => row.id === original.id)).toMatchObject({
            amount: original.amount,
            booked_at: original.booked_at,
            tag_id: original.tag_id,
          });
        expect(
          (await f.db.rows("account", { id: f.accountId }))[0].balance,
        ).toBe("500000.00");
      } finally {
        await api.app.close();
        await f.db.close();
      }
    });

    it("splits a credit across purchases, pages either side and leaves only the remainder unclassified", async () => {
      const f = await fixture(true);
      const api = await startApi(f);
      try {
        const client = api.client();
        const p = await movement(f, "-60.00", "2026-09-15T15:00:00Z");
        const q = await movement(f, "-40.00", "2026-10-15T15:00:00Z");
        const c = await movement(f, "110.00", "2026-11-02T15:00:00Z");
        await client.transactions.setExpenseAdjustment.mutate({
          creditTransactionId: c.id,
          purchaseTransactionId: p.id,
          amount: "60.00",
          kind: "refund",
        });
        await client.transactions.setExpenseAdjustment.mutate({
          creditTransactionId: c.id,
          purchaseTransactionId: q.id,
          amount: "40.00",
          kind: "reimbursement",
        });
        expect(
          await client.summaries.monthly.query({ month: "2026-09" }),
        ).toMatchObject({ spending: "0.00", grossSpending: "60.00" });
        expect(
          await client.summaries.monthly.query({ month: "2026-10" }),
        ).toMatchObject({ spending: "0.00", grossSpending: "40.00" });
        expect(
          await client.income.summary.query({ month: "2026-11" }),
        ).toMatchObject({
          unclassifiedCredits: { amount: "10.00", count: 1 },
          recoveredExpenseCredits: { amount: "100.00", count: 1 },
        });
        const first = await client.transactions.expenseAdjustments.query({
          transactionId: c.id,
          limit: 1,
        });
        expect(first.pageInfo.hasMore).toBe(true);
        const cursor = first.pageInfo.nextCursor;
        if (!cursor) throw new Error("Expected a continuation");
        const second = await client.transactions.expenseAdjustments.query({
          transactionId: c.id,
          limit: 1,
          cursor,
        });
        expect(
          new Set([...first.items, ...second.items].map((row) => row.id)).size,
        ).toBe(2);
        expect(second.pageInfo.hasMore).toBe(false);
        await expect(
          client.transactions.expenseAdjustments.query({
            transactionId: p.id,
            cursor,
          }),
        ).rejects.toMatchObject({ data: { code: "BAD_REQUEST" } });
        for (const cursor of [
          "not-a-cursor",
          Buffer.from(
            JSON.stringify({
              version: 2,
              transactionId: c.id,
              after: first.items[0].id,
            }),
          ).toString("base64url"),
        ])
          await expect(
            client.transactions.expenseAdjustments.query({
              transactionId: c.id,
              cursor,
            }),
          ).rejects.toMatchObject({ data: { code: "BAD_REQUEST" } });
        const pair = { creditTransactionId: c.id, purchaseTransactionId: q.id };
        await client.transactions.removeExpenseAdjustment.mutate(pair);
        await client.transactions.removeExpenseAdjustment.mutate(pair);
        expect(
          await client.income.summary.query({ month: "2026-11" }),
        ).toMatchObject({
          unclassifiedCredits: { amount: "50.00", count: 1 },
          recoveredExpenseCredits: { amount: "60.00", count: 1 },
        });
      } finally {
        await api.app.close();
        await f.db.close();
      }
    });

    it("serializes allocation capacity races and isolates both related owners", async () => {
      const f = await fixture(true);
      const api = await startApi(f);
      try {
        const client = api.client(),
          other = api.client(f.otherToken);
        const p = await movement(f, "-100.00", "2026-10-15T15:00:00Z");
        const credits = await Promise.all(
          [1, 2].map(() => movement(f, "80.00", "2026-11-02T15:00:00Z")),
        );
        const foreign = await movement(
          f,
          "80.00",
          "2026-11-02T15:00:00Z",
          f.otherAccountId,
        );
        for (const work of [
          () =>
            client.transactions.setExpenseAdjustment.mutate({
              creditTransactionId: foreign.id,
              purchaseTransactionId: p.id,
              amount: "1",
              kind: "refund",
            }),
          () =>
            other.transactions.setExpenseAdjustment.mutate({
              creditTransactionId: foreign.id,
              purchaseTransactionId: p.id,
              amount: "1",
              kind: "refund",
            }),
          () =>
            other.transactions.expenseAdjustments.query({
              transactionId: p.id,
            }),
          () =>
            other.transactions.removeExpenseAdjustment.mutate({
              creditTransactionId: credits[0].id,
              purchaseTransactionId: p.id,
            }),
        ])
          await expect(work()).rejects.toMatchObject({
            data: { code: "NOT_FOUND" },
          });
        const results = await Promise.allSettled(
          credits.map((c) =>
            client.transactions.setExpenseAdjustment.mutate({
              creditTransactionId: c.id,
              purchaseTransactionId: p.id,
              amount: "60.00",
              kind: "refund",
            }),
          ),
        );
        expect(
          results.filter((result) => result.status === "fulfilled"),
        ).toHaveLength(1);
        expect(
          results.find((result) => result.status === "rejected"),
        ).toMatchObject({ reason: { data: { code: "CONFLICT" } } });
        expect(
          await client.summaries.monthly.query({ month: "2026-10" }),
        ).toMatchObject({ spending: "40.00", refunds: "60.00" });
        expect(
          await f.db.rows("expense_adjustment", {
            purchaseTransactionId: p.id,
          }),
        ).toHaveLength(1);

        const sharedCredit = await movement(f, "80.00", "2026-11-02T16:00:00Z");
        const purchases = await Promise.all(
          [1, 2].map(() => movement(f, "-100.00", "2026-10-15T16:00:00Z")),
        );
        const splits = await Promise.allSettled(
          purchases.map((purchase) =>
            client.transactions.setExpenseAdjustment.mutate({
              creditTransactionId: sharedCredit.id,
              purchaseTransactionId: purchase.id,
              amount: "60.00",
              kind: "reimbursement",
            }),
          ),
        );
        expect(
          splits.filter((result) => result.status === "fulfilled"),
        ).toHaveLength(1);
        expect(
          splits.find((result) => result.status === "rejected"),
        ).toMatchObject({ reason: { data: { code: "CONFLICT" } } });
        expect(
          await f.db.rows("expense_adjustment", {
            creditTransactionId: sharedCredit.id,
          }),
        ).toHaveLength(1);

        const incomeCredit = await movement(f, "80.00", "2026-11-02T17:00:00Z");
        const source = await client.income.createSource.mutate({
          name: "Race",
          regularity: "irregular",
          amountKind: "variable",
          startDate: "2026-01-01",
        });
        const classifications = await Promise.allSettled([
          client.transactions.setExpenseAdjustment.mutate({
            creditTransactionId: incomeCredit.id,
            purchaseTransactionId: purchases[0].id,
            amount: "10.00",
            kind: "refund",
          }),
          client.income.confirm.mutate({
            transactionId: incomeCredit.id,
            sourceId: source.id,
          }),
        ]);
        expect(
          classifications.filter((result) => result.status === "fulfilled"),
        ).toHaveLength(1);
        expect(
          classifications.find((result) => result.status === "rejected"),
        ).toMatchObject({ reason: { data: { code: "CONFLICT" } } });
        const allocations = await f.db.rows("expense_adjustment", {
          creditTransactionId: incomeCredit.id,
        });
        const receipts = await f.db.rows("income_receipt", {
          transactionId: incomeCredit.id,
        });
        expect(allocations.length + receipts.length).toBe(1);
      } finally {
        await api.app.close();
        await f.db.close();
      }
    });

    it("rejects income conflicts in either direction and flags corrected facts until explicit reconfirmation", async () => {
      const f = await fixture(true);
      const api = await startApi(f);
      try {
        const client = api.client();
        const p = await movement(f, "-100.00", "2026-10-15T15:00:00.123456Z");
        const c = await movement(f, "50.00", "2026-11-02T15:00:00.123456Z");
        const source = await client.income.createSource.mutate({
          name: "Income",
          regularity: "irregular",
          amountKind: "variable",
          startDate: "2026-01-01",
        });
        await client.income.confirm.mutate({
          transactionId: c.id,
          sourceId: source.id,
        });
        const input = {
          creditTransactionId: c.id,
          purchaseTransactionId: p.id,
          amount: "30.00",
          kind: "refund" as const,
        };
        await expect(
          client.transactions.setExpenseAdjustment.mutate(input),
        ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
        await client.income.clear.mutate({ id: c.id });
        await client.transactions.setExpenseAdjustment.mutate(input);
        await expect(
          client.income.confirm.mutate({
            transactionId: c.id,
            sourceId: source.id,
          }),
        ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
        await f.db.update("transaction", p.id, { amount: "-90.00" });
        expect(
          (
            await client.transactions.expenseAdjustments.query({
              transactionId: c.id,
            })
          ).items[0].status,
        ).toBe("needs_review");
        expect(
          await client.summaries.monthly.query({ month: "2026-10" }),
        ).toMatchObject({
          spending: "90.00",
          refunds: "0.00",
          unresolvedAdjustmentCount: 1,
        });
        expect(
          await client.income.summary.query({ month: "2026-11" }),
        ).toMatchObject({
          receivedIncome: "0.00",
          unclassifiedCredits: { amount: "20.00" },
          recoveredExpenseCredits: { amount: "0.00", needsReviewCount: 1 },
        });
        expect(
          await client.transactions.setExpenseAdjustment.mutate(input),
        ).toMatchObject({ status: "applied" });
        expect(
          await client.summaries.monthly.query({ month: "2026-10" }),
        ).toMatchObject({ spending: "60.00", refunds: "30.00" });
        await f.db.update("transaction", p.id, {
          bookedAt: "2026-10-15T15:00:00.123457Z",
        });
        expect(
          (
            await client.transactions.expenseAdjustments.query({
              transactionId: p.id,
            })
          ).items[0],
        ).toMatchObject({
          status: "needs_review",
          purchaseBookedAt: "2026-10-15T15:00:00.123457Z",
        });
        expect(
          await client.transactions.setExpenseAdjustment.mutate(input),
        ).toMatchObject({ status: "applied" });
        await f.db.update("transaction", c.id, { amount: "20.00" });
        expect(
          await client.income.summary.query({ month: "2026-11" }),
        ).toMatchObject({
          unclassifiedCredits: { amount: "0.00", count: 0 },
          recoveredExpenseCredits: { amount: "0.00", needsReviewCount: 1 },
        });
        await expect(
          client.transactions.setExpenseAdjustment.mutate(input),
        ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
        await client.transactions.setExpenseAdjustment.mutate({
          ...input,
          amount: "20.00",
        });
        await f.db.update("transaction", p.id, { isInternalMovement: true });
        expect(
          (
            await client.transactions.expenseAdjustments.query({
              transactionId: p.id,
            })
          ).items[0].status,
        ).toBe("needs_review");
        await f.db.update("transaction", p.id, { isInternalMovement: false });
        await f.db.update("transaction", c.id, {
          removedAt: "2026-11-05T15:00:00Z",
          removalReason: "reversed",
        });
        expect(
          await client.summaries.monthly.query({ month: "2026-10" }),
        ).toMatchObject({
          spending: "90.00",
          refunds: "0.00",
          unresolvedAdjustmentCount: 1,
        });
        await client.transactions.removeExpenseAdjustment.mutate({
          creditTransactionId: c.id,
          purchaseTransactionId: p.id,
        });
        expect(
          (
            await client.transactions.expenseAdjustments.query({
              transactionId: p.id,
            })
          ).items,
        ).toEqual([]);
      } finally {
        await api.app.close();
        await f.db.close();
      }
    });

    it("rejects unsupported, future, internal, unresolved, removed, excessive and chronologically invalid links atomically", async () => {
      const f = await fixture(true);
      const api = await startApi(f);
      try {
        const client = api.client();
        const p = await movement(f, "-10.01", "2026-10-15T15:00:00.123456Z");
        const c = await movement(f, "20.02", "2026-11-02T15:00:00Z");
        const input = {
          creditTransactionId: c.id,
          purchaseTransactionId: p.id,
          amount: "1.01",
          kind: "refund" as const,
        };
        for (const update of [
          { isInternalMovement: true },
          { isInternalMovement: null },
          { reviewStatus: "needs_review" as const },
          {
            removedAt: "2026-11-03T15:00:00Z",
            removalReason: "removed" as const,
          },
          { bookedAt: "2099-01-01T15:00:00Z" },
          { bookedAt: "2026-10-15T15:00:00.123455Z" },
        ]) {
          await f.db.update("transaction", c.id, update);
          await expect(
            client.transactions.setExpenseAdjustment.mutate(input),
          ).rejects.toMatchObject({ data: { code: "BAD_REQUEST" } });
          await f.db.update("transaction", c.id, {
            isInternalMovement: false,
            reviewStatus: "clear",
            removedAt: null,
            removalReason: null,
            bookedAt: "2026-11-02T15:00:00Z",
          });
        }
        for (const amount of ["0", "-1", "1.001", "10000000000000"])
          await expect(
            client.transactions.setExpenseAdjustment.mutate({
              ...input,
              amount,
            }),
          ).rejects.toMatchObject({ data: { code: "BAD_REQUEST" } });
        await expect(
          client.transactions.setExpenseAdjustment.mutate({
            ...input,
            amount: "10.02",
          }),
        ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
        await expect(
          client.transactions.setExpenseAdjustment.mutate({
            ...input,
            creditTransactionId: p.id,
            purchaseTransactionId: c.id,
          }),
        ).rejects.toMatchObject({ data: { code: "BAD_REQUEST" } });
        await expect(
          client.transactions.setExpenseAdjustment.mutate({
            ...input,
            purchaseTransactionId: c.id,
          }),
        ).rejects.toMatchObject({ data: { code: "BAD_REQUEST" } });
        expect(
          await f.db.rows("expense_adjustment", { creditTransactionId: c.id }),
        ).toEqual([]);
        expect(
          await client.transactions.setExpenseAdjustment.mutate({
            ...input,
            amount: "10.01",
          }),
        ).toMatchObject({ status: "applied", amount: "10.01" });
      } finally {
        await api.app.close();
        await f.db.close();
      }
    });

    it("observes confirmed recoveries independently of the original purchase cutoff with exact instants", async () => {
      const f = await fixture(true);
      const api = await startApi(f);
      try {
        const p = await movement(f, "-100.03", "2026-10-15T15:00:00.123456Z");
        const c = await movement(f, "30.01", "2026-11-02T15:00:00.123456Z");
        const adjustment = await api
          .client()
          .transactions.setExpenseAdjustment.mutate({
            creditTransactionId: c.id,
            purchaseTransactionId: p.id,
            amount: "30.01",
            kind: "refund",
          });
        const confirmedAt = "2026-11-03T15:00:00.123456Z";
        await f.db.update("expense_adjustment", adjustment.id, { confirmedAt });
        const transactions = f.persistence.user(f.userId).transactions;
        const period = {
          start: "2026-10-01 00:00:00",
          end: "2026-11-01 00:00:00",
          asOf: "2026-10-20T15:00:00Z",
        };
        expect(
          await transactions.aggregates.query({
            ...period,
            adjustmentsAsOf: "2026-11-03T15:00:00.123455Z",
          }),
        ).toEqual([
          expect.objectContaining({
            amount: "-100.03",
            refundAmount: "0",
            purchaseAdjustmentReviewCount: 0,
          }),
        ]);
        expect(
          await transactions.aggregates.query({
            ...period,
            adjustmentsAsOf: confirmedAt,
          }),
        ).toEqual([
          expect.objectContaining({
            amount: "-100.03",
            refundAmount: "30.01",
            purchaseAdjustmentReviewCount: 0,
          }),
        ]);
        expect(
          await transactions.aggregates.query({
            ...period,
            asOf: "2026-10-14T15:00:00Z",
            adjustmentsAsOf: confirmedAt,
          }),
        ).toEqual([]);
        const creditPeriod = {
          start: "2026-11-01 00:00:00",
          end: "2026-12-01 00:00:00",
        };
        expect(
          await transactions.aggregates.query({
            ...creditPeriod,
            adjustmentsAsOf: "2026-11-03T15:00:00.123455Z",
          }),
        ).toEqual([
          expect.objectContaining({
            reservedCreditAmount: "0",
            expenseCreditAmount: "0",
            unclassifiedCreditCount: 1,
          }),
        ]);
        expect(
          await transactions.aggregates.query({
            ...creditPeriod,
            adjustmentsAsOf: confirmedAt,
          }),
        ).toEqual([
          expect.objectContaining({
            reservedCreditAmount: "30.01",
            expenseCreditAmount: "30.01",
            unclassifiedCreditCount: 0,
          }),
        ]);
      } finally {
        await api.app.close();
        await f.db.close();
      }
    });

    it("keeps same-month refunds and later corrections on revision-specific tags without adding purchases after archival", async () => {
      const f = await fixture(true);
      const api = await startApi(f);
      try {
        const client = api.client();
        const oldTag = await client.tags.create.mutate({
          name: "Original selection",
        });
        const newTag = await client.tags.create.mutate({
          name: "Next selection",
        });
        const id = randomUUID(),
          revisionId = randomUUID();
        await f.db.insert("objective", {
          id,
          userId: f.userId,
          name: "Revised",
          amount: "200.00",
          kind: "time_based",
          intent: "spending",
          isRecurring: true,
          period: "monthly",
          startDate: "2026-09-01T04:00:00Z",
          archivedAt: "2026-10-20T15:00:00.123456Z",
          budgetVersion: 2,
        });
        for (const [version, revision, tag, effectiveFrom, amount] of [
          [1, id, oldTag.id, "2026-09-01T04:00:00Z", "100.00"],
          [2, revisionId, newTag.id, "2026-10-01T03:00:00Z", "200.00"],
        ] as const) {
          await f.db.insert("budget_revision", {
            id: revision,
            objectiveId: id,
            version,
            name: "Revised",
            amount,
            kind: "time_based",
            isRecurring: true,
            period: "monthly",
            startDate: "2026-09-01T04:00:00Z",
            effectiveFrom,
          });
          await f.db.insert("budget_revision_tag", {
            revisionId: revision,
            tagId: tag,
          });
        }
        const september = await movement(
          f,
          "-20.00",
          "2026-09-15T15:00:00Z",
          f.accountId,
          oldTag.id,
        );
        const october = await movement(
          f,
          "-20.00",
          "2026-10-20T15:00:00.123455Z",
          f.accountId,
          newTag.id,
        );
        const atCutoff = await movement(
          f,
          "-25.00",
          "2026-10-20T15:00:00.123456Z",
          f.accountId,
          newTag.id,
        );
        await movement(
          f,
          "-10.00",
          "2026-10-15T15:00:00Z",
          f.accountId,
          oldTag.id,
        );
        const sameMonthCredit = await movement(
          f,
          "5.00",
          "2026-09-30T15:00:00Z",
        );
        const laterCredit = await movement(f, "10.00", "2026-11-02T15:00:00Z");
        for (const [credit, purchase, amount] of [
          [sameMonthCredit, september, "5.00"],
          [laterCredit, october, "3.00"],
          [laterCredit, atCutoff, "7.00"],
        ] as const)
          await client.transactions.setExpenseAdjustment.mutate({
            creditTransactionId: credit.id,
            purchaseTransactionId: purchase.id,
            amount,
            kind: "refund",
          });

        expect(
          await client.summaries.monthly.query({ month: "2026-09" }),
        ).toMatchObject({
          grossSpending: "20.00",
          spending: "15.00",
          refunds: "5.00",
          recoveredExpenseCredits: { amount: "5.00", count: 1 },
          receivedIncome: "0.00",
        });
        expect(
          (await client.objectives.progress.query({ month: "2026-09" })).find(
            (budget) => budget.id === id,
          ),
        ).toMatchObject({
          revisionId: id,
          limit: "100.00",
          grossSpent: "20.00",
          refunds: "5.00",
          spent: "15.00",
        });
        expect(
          (await client.objectives.progress.query({ month: "2026-10" })).find(
            (budget) => budget.id === id,
          ),
        ).toMatchObject({
          revisionId,
          limit: "200.00",
          grossSpent: "20.00",
          refunds: "3.00",
          spent: "17.00",
          tracking: { end: "2026-10-20T15:00:00.123456Z" },
        });
        expect(
          (
            await client.transactions.expenseAdjustments.query({
              transactionId: september.id,
            })
          ).items[0].purchaseTag?.id,
        ).toBe(oldTag.id);
        await client.tags.decide.mutate({
          transactionId: october.id,
          tagId: oldTag.id,
        });
        expect(
          (
            await client.transactions.expenseAdjustments.query({
              transactionId: laterCredit.id,
            })
          ).items.find(
            (adjustment) => adjustment.purchaseTransactionId === october.id,
          ),
        ).toMatchObject({ purchaseTag: { id: oldTag.id }, status: "applied" });
        expect(
          (await client.objectives.progress.query({ month: "2026-10" })).find(
            (budget) => budget.id === id,
          ),
        ).toMatchObject({ grossSpent: "0.00", refunds: "0.00", spent: "0.00" });
      } finally {
        await api.app.close();
        await f.db.close();
      }
    });
  },
);
