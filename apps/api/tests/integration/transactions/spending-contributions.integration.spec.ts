import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { fromCents, toCents } from "../../../src/utils/money";
import { oauthAppFixture } from "../../fixtures/mcp/oauth-app";
import {
  type Fixture,
  fixture,
  integration,
  startApi,
} from "../../fixtures/persistence";

async function budget(
  f: Fixture,
  tagIds: string[],
  options: {
    isRecurring?: boolean;
    period?: "monthly" | "yearly" | null;
    startDate?: string;
    endDate?: string | null;
    archivedAt?: string | null;
  } = {},
) {
  const { archivedAt = null, ...schedule } = options;
  const definition = {
    name: "Tracked budget",
    amount: "500.00",
    kind: "time_based" as const,
    isRecurring: true,
    period: "monthly" as "monthly" | "yearly" | null,
    startDate: "2026-09-01T04:00:00Z",
    endDate: null as string | null,
    ...schedule,
  };
  const row = await f.db.insert("objective", {
    ...definition,
    archivedAt,
    intent: "spending",
    userId: f.userId,
  });
  const revision = await f.db.insert("budget_revision", {
    ...definition,
    objectiveId: row.id,
    version: 1,
    effectiveFrom: definition.startDate,
  });
  for (const tagId of tagIds)
    await f.db.insert("budget_revision_tag", {
      revisionId: revision.id,
      tagId,
    });
  return { id: row.id, revisionId: revision.id };
}

describe.skipIf(!integration)("traceable spending and budget totals", () => {
  it("reconciles complete gross/recovery/net aggregates, untagged coverage and revision-specific archived budgets across pages", async () => {
    const f = await oauthAppFixture(),
      api = f.api;
    try {
      const client = api.client(),
        tag = await client.tags.create.mutate({ name: "Purchases" }),
        secondTag = await client.tags.create.mutate({ name: "Other selected" });
      const card = await f.db.insert("account", {
        userId: f.userId,
        providerConnectionId: f.connectionId,
        type: "credit_card",
      });
      const movement = async (
        amount: string,
        bookedAt: string,
        tagId: string | null = null,
        accountId: string = f.accountId,
        changes: {
          isInternalMovement?: boolean | null;
          reviewStatus?: "clear" | "needs_review";
          removedAt?: string;
          removalReason?: "removed";
        } = {},
      ) =>
        f.db.insert("transaction", {
          accountId,
          amount,
          type: amount.startsWith("-") ? "debit" : "credit",
          bookedAt,
          tagId,
          tagDecisionOrigin: "manual",
          isInternalMovement: false,
          ...changes,
        });
      const purchase = await movement(
        "-100.00",
        "2026-09-10T15:00:00.123456Z",
        tag.id,
      );
      await movement("-50.00", "2026-09-10T15:00:00.123457Z", secondTag.id);
      const untagged = await movement("-40.00", "2026-09-12T15:00:00Z");
      await movement("-10.00", "2026-09-15T15:00:00Z", tag.id, card.id);
      await movement("-60.00", "2026-09-22T15:00:00Z", tag.id);
      await movement("-999.00", "2026-09-01T03:59:59.999999Z", tag.id);
      await movement("-999.00", "2026-10-01T03:00:00Z", tag.id);
      for (const changes of [
        { isInternalMovement: true },
        { isInternalMovement: null },
        { reviewStatus: "needs_review" as const },
        {
          removedAt: "2026-09-20T00:00:00Z",
          removalReason: "removed" as const,
        },
      ])
        await movement(
          "-999.00",
          "2026-09-15T15:00:00Z",
          tag.id,
          undefined,
          changes,
        );
      const foreign = await movement(
        "-999.00",
        "2026-09-10T15:00:00Z",
        null,
        f.otherAccountId,
      );
      const refund = await movement("30.00", "2026-10-15T15:00:00Z");
      const reimbursement = await movement("10.00", "2026-11-01T15:00:00Z");
      await client.transactions.setExpenseAdjustment.mutate({
        creditTransactionId: refund.id,
        purchaseTransactionId: purchase.id,
        amount: "20.00",
        kind: "refund",
      });
      await client.transactions.setExpenseAdjustment.mutate({
        creditTransactionId: reimbursement.id,
        purchaseTransactionId: purchase.id,
        amount: "10.00",
        kind: "reimbursement",
      });
      const target = await budget(f, [tag.id, secondTag.id], {
        archivedAt: "2026-09-20T15:00:00.000001Z",
      });
      // A later selection must never replace the earlier period's stored tags.
      const later = await f.db.insert("budget_revision", {
        objectiveId: target.id,
        version: 2,
        name: "Later",
        amount: "600.00",
        kind: "time_based",
        isRecurring: true,
        period: "monthly",
        startDate: "2026-09-01T04:00:00Z",
        effectiveFrom: "2026-10-01T03:00:00Z",
      });
      await f.db.insert("budget_revision_tag", {
        revisionId: later.id,
        tagId: secondTag.id,
      });
      await client.tags.archive.mutate({ id: tag.id });
      const summary = await client.summaries.monthly.query({
        month: "2026-09",
      });
      const selection = {
        month: "2026-09",
        asOf: "2026-09-30T23:00:00Z",
        adjustmentsAsOf: summary.adjustmentsAsOf,
      };
      const first = await client.summaries.spendingContributions.query({
        ...selection,
        limit: 1,
      });
      expect(first.totals).toMatchObject({
        grossSpending: summary.grossSpending,
        refunds: summary.refunds,
        reimbursements: summary.reimbursements,
        spending: summary.spending,
        count: 5,
      });
      expect(first.totals).toMatchObject({
        grossSpending: "260.00",
        refunds: "20.00",
        reimbursements: "10.00",
        spending: "230.00",
      });
      expect(first).toMatchObject({
        includesUntagged: true,
        untaggedInSelection: {
          grossSpending: "40.00",
          spending: "40.00",
          count: 1,
        },
      });
      const items = [...first.items];
      let cursor = first.pageInfo.nextCursor;
      while (cursor) {
        const page = await client.summaries.spendingContributions.query({
          ...selection,
          cursor,
          limit: 2,
        });
        expect(page.totals).toEqual(first.totals);
        items.push(...page.items);
        cursor = page.pageInfo.nextCursor;
      }
      expect(new Set(items.map((row) => row.id)).size).toBe(5);
      for (const field of [
        "grossSpending",
        "refunds",
        "reimbursements",
        "spending",
      ] as const)
        expect(
          fromCents(items.reduce((sum, row) => sum + toCents(row[field]), 0n)),
        ).toBe(first.totals[field]);
      expect(items.find((row) => row.id === purchase.id)).toMatchObject({
        amount: "-100.00",
        bookedAt: "2026-09-10T15:00:00.123456Z",
        refunds: "20.00",
        reimbursements: "10.00",
        spending: "70.00",
        tag: { id: tag.id },
      });
      expect(
        (
          await client.summaries.spendingContributions.query({
            ...selection,
            tagId: null,
          })
        ).items.map((row) => row.id),
      ).toEqual([untagged.id]);
      const tagged = await client.summaries.spendingContributions.query({
        ...selection,
        tagId: tag.id,
      });
      expect(tagged.totals.spending).toBe(
        summary.tags.find((row) => row.id === tag.id)?.amount,
      );
      expect(tagged.includesUntagged).toBe(false);
      const progress = (
        await client.objectives.progress.query({ month: "2026-09" })
      ).find((row) => row.id === target.id);
      if (!progress) throw new Error("Missing reported budget");
      const budgetPage = await client.objectives.budgetContributions.query({
        ...target,
        ...selection,
        adjustmentsAsOf: progress.adjustmentsAsOf,
        limit: 1,
      });
      expect(budgetPage).toMatchObject({
        totals: {
          grossSpending: progress.grossSpent,
          refunds: progress.refunds,
          reimbursements: progress.reimbursements,
          spending: progress.spent,
          count: 3,
        },
        tracking: { ...progress.tracking, revisionId: progress.revisionId },
        includesUntagged: false,
        untaggedInSelection: { count: 0 },
      });
      expect(budgetPage.totals.spending).toBe("130.00");
      const budgetItems = [...budgetPage.items];
      let budgetCursor = budgetPage.pageInfo.nextCursor;
      while (budgetCursor) {
        const page = await client.objectives.budgetContributions.query({
          ...target,
          ...selection,
          adjustmentsAsOf: progress.adjustmentsAsOf,
          cursor: budgetCursor,
          limit: 2,
        });
        budgetItems.push(...page.items);
        budgetCursor = page.pageInfo.nextCursor;
      }
      for (const field of [
        "grossSpending",
        "refunds",
        "reimbursements",
        "spending",
      ] as const)
        expect(
          fromCents(
            budgetItems.reduce((sum, row) => sum + toCents(row[field]), 0n),
          ),
        ).toBe(budgetPage.totals[field]);
      const mcp = await fetch(`${api.url}/mcp`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${(await f.authorize()).access_token}`,
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "consultar_compras_del_gasto", arguments: selection },
        }),
      });
      expect((await mcp.json()).result.structuredContent.totals).toEqual(
        first.totals,
      );
      if (!first.pageInfo.nextCursor) throw new Error("Missing summary cursor");
      for (const changed of [
        { tagId: null },
        { asOf: "2026-09-29T00:00:00Z" },
        { month: "2026-08" },
      ])
        await expect(
          client.summaries.spendingContributions.query({
            ...selection,
            cursor: first.pageInfo.nextCursor,
            ...changed,
          }),
        ).rejects.toMatchObject({ data: { code: "BAD_REQUEST" } });
      await expect(
        client.summaries.spendingContributions.query({
          month: selection.month,
          cursor: first.pageInfo.nextCursor,
        }),
      ).rejects.toMatchObject({ data: { code: "BAD_REQUEST" } });
      await expect(
        api
          .client(f.otherToken)
          .objectives.budgetContributions.query({ ...target, ...selection }),
      ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
      await expect(
        client.objectives.budgetContributions.query({
          ...target,
          ...selection,
          revisionId: later.id,
        }),
      ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
      expect(
        (
          await api
            .client(f.otherToken)
            .summaries.spendingContributions.query(selection)
        ).items.map((row) => row.id),
      ).toEqual([foreign.id]);
      await f.db.update("transaction", purchase.id, { amount: "-120.00" });
      const corrected =
        await client.summaries.spendingContributions.query(selection);
      expect(corrected.totals).toMatchObject({
        grossSpending: "280.00",
        spending: "280.00",
        refunds: "0.00",
        reimbursements: "0.00",
        unresolvedAdjustmentCount: 2,
      });
      expect((await f.db.rows("account", { id: f.accountId }))[0].balance).toBe(
        "500000.00",
      );
    } finally {
      await api.app.close();
      await f.db.close();
    }
  });

  it("keeps aggregate and per-purchase values exact beyond Number's integer range", async () => {
    const f = await fixture(true),
      api = await startApi(f);
    try {
      for (let index = 0; index < 2; index++)
        await f.db.insert("transaction", {
          accountId: f.accountId,
          amount: "-9007199254740.99",
          type: "debit",
          bookedAt: "2026-09-10T15:00:00Z",
          isInternalMovement: false,
        });
      const page = await api
        .client()
        .summaries.spendingContributions.query({ month: "2026-09" });
      expect(page.totals.grossSpending).toBe("18014398509481.98");
      expect(page.items.map((item) => item.spending)).toEqual([
        "9007199254740.99",
        "9007199254740.99",
      ]);
    } finally {
      await api.app.close();
      await f.db.close();
    }
  });

  it("shares monthly/yearly/fixed windows and preserves exact inclusive observation and exclusive archive boundaries", async () => {
    const f = await fixture(true),
      api = await startApi(f);
    try {
      const client = api.client(),
        tag = await client.tags.create.mutate({ name: "Period evidence" });
      for (const [amount, bookedAt] of [
        ["-1.00", "2026-01-20T15:00:00Z"],
        ["-2.00", "2026-08-20T15:00:00Z"],
        ["-3.00", "2026-09-01T04:00:00Z"],
        ["-4.00", "2026-09-10T15:00:00.000001Z"],
        ["-5.00", "2026-09-15T03:00:00Z"],
        ["-6.00", "2026-09-20T15:00:00.000001Z"],
      ])
        await f.db.insert("transaction", {
          accountId: f.accountId,
          tagId: tag.id,
          tagDecisionOrigin: "manual",
          amount,
          type: "debit",
          bookedAt,
          isInternalMovement: false,
        });
      const common = { archivedAt: "2026-09-20T15:00:00.000001Z" };
      const targets = [
        [await budget(f, [tag.id], common), "12.00", "3.00"],
        [
          await budget(f, [tag.id], {
            ...common,
            period: "yearly",
            startDate: "2026-01-01T03:00:00Z",
          }),
          "15.00",
          "6.00",
        ],
        [
          await budget(f, [tag.id], {
            ...common,
            isRecurring: false,
            period: null,
            startDate: "2026-08-15T04:00:00Z",
            endDate: "2026-09-16T03:00:00Z",
          }),
          "14.00",
          "5.00",
        ],
      ] as const;
      const progress = await client.objectives.progress.query({
        month: "2026-09",
      });
      for (const [target, total, observed] of targets) {
        const full = await client.objectives.budgetContributions.query({
          ...target,
          month: "2026-09",
        });
        expect(full.totals.spending).toBe(total);
        expect(full.totals.spending).toBe(
          progress.find((row) => row.id === target.id)?.spent,
        );
        const before = await client.objectives.budgetContributions.query({
          ...target,
          month: "2026-09",
          asOf: "2026-09-10T15:00:00.000000Z",
        });
        expect(before.totals.spending).toBe(observed);
        const inclusive = await client.objectives.budgetContributions.query({
          ...target,
          month: "2026-09",
          asOf: "2026-09-10T15:00:00.000001Z",
        });
        expect(
          toCents(inclusive.totals.spending) - toCents(before.totals.spending),
        ).toBe(400n);
      }
      const before = await client.summaries.spendingContributions.query({
        month: "2026-09",
        asOf: "2026-09-10T15:00:00.000000Z",
      });
      const inclusive = await client.summaries.spendingContributions.query({
        month: "2026-09",
        asOf: "2026-09-10T15:00:00.000001Z",
      });
      expect(before.totals.spending).toBe("3.00");
      expect(inclusive.totals.spending).toBe("7.00");
      const empty = await client.summaries.spendingContributions.query({
        month: "2025-01",
      });
      expect(empty).toMatchObject({
        items: [],
        totals: { spending: "0.00", count: 0 },
        pageInfo: { hasMore: false, nextCursor: null },
      });
      await expect(
        client.objectives.budgetContributions.query({
          id: randomUUID(),
          revisionId: randomUUID(),
          month: "2026-09",
        }),
      ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
      await expect(
        client.summaries.spendingContributions.query({
          month: "2026-09",
          asOf: "9999-01-01T00:00:00Z",
        }),
      ).rejects.toMatchObject({ data: { code: "BAD_REQUEST" } });
    } finally {
      await api.app.close();
      await f.db.close();
    }
  });
});
