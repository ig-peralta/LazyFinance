import { describe, expect, it, vi } from "vitest";
import type { AsyncStub } from "../../tests/fixtures/rpc-stubs";
import type { PersistenceClient } from "../persistence/persistence.client";
import { TransactionsService } from "./transactions.service";

const userId = "00000000-0000-4000-8000-000000000001";
const firstId = "00000000-0000-4000-8000-000000000011";
const secondId = "00000000-0000-4000-8000-000000000012";

type RecentQuery = AsyncStub<
  ReturnType<PersistenceClient["user"]>["transactions"]["recent"]["query"]
>;

type ListQuery = AsyncStub<
  ReturnType<PersistenceClient["user"]>["transactions"]["list"]["query"]
>;

describe("TransactionsService", () => {
  it("assembles tagged and untagged movements with a singular nullable tag", async () => {
    const tag = {
      id: "00000000-0000-4000-8000-000000000032",
      name: "Suscripciones",
      color: null,
    };
    const rows = [
      {
        id: firstId,
        bookedAt: "2026-10-15T15:00:00.000Z",
        amount: "-49990.00",
        type: "debit" as const,
        merchant: "Netflix",
        description: null,
        accountId: "00000000-0000-4000-8000-000000000021",
        accountAlias: "Tarjeta",
        accountType: "credit_card" as const,
        currency: "CLP" as const,
        tag,
        tagDecisionOrigin: "manual" as const,
        tagRuleId: null,
        reviewStatus: "clear" as const,
      },
      {
        id: secondId,
        bookedAt: "2026-10-14T15:00:00.000Z",
        amount: "140000.00",
        type: "credit" as const,
        merchant: null,
        description: "Ahorro",
        accountId: "00000000-0000-4000-8000-000000000022",
        accountAlias: null,
        accountType: "savings" as const,
        currency: "CLP" as const,
        tag: null,
        tagDecisionOrigin: "unreviewed" as const,
        tagRuleId: null,
        reviewStatus: "clear" as const,
      },
    ];
    const query = vi.fn<RecentQuery>(async () => rows);
    const user = vi.fn(() => ({ transactions: { recent: { query } } }));
    const service = new TransactionsService({
      user,
    } as unknown as PersistenceClient);

    await expect(service.getRecentForUser(userId)).resolves.toEqual([
      {
        id: firstId,
        bookedAt: "2026-10-15T15:00:00.000Z",
        amount: "-49990.00",
        type: "debit",
        merchant: "Netflix",
        description: null,
        account: {
          id: rows[0].accountId,
          alias: "Tarjeta",
          type: "credit_card",
          currency: "CLP",
        },
        tag,
        tagDecisionOrigin: "manual",
        tagRuleId: null,
        reviewStatus: "clear",
      },
      {
        id: secondId,
        bookedAt: "2026-10-14T15:00:00.000Z",
        amount: "140000.00",
        type: "credit",
        merchant: null,
        description: "Ahorro",
        account: {
          id: rows[1].accountId,
          alias: null,
          type: "savings",
          currency: "CLP",
        },
        tag: null,
        tagDecisionOrigin: "unreviewed",
        tagRuleId: null,
        reviewStatus: "clear",
      },
    ]);
    expect(user).toHaveBeenCalledWith(userId);
  });

  it("returns no movements for an empty history", async () => {
    const query = vi.fn<RecentQuery>(async () => []);
    const service = new TransactionsService({
      user: () => ({ transactions: { recent: { query } } }),
    } as unknown as PersistenceClient);

    await expect(service.getRecentForUser(userId)).resolves.toEqual([]);
  });

  it.each([
    null,
    "next-page",
  ])("composes public page items without changing continuation metadata", async (nextCursor) => {
    const record = {
      id: firstId,
      bookedAt: "2026-10-15T15:00:00.000Z",
      amount: "9007199254740.99",
      type: "credit" as const,
      merchant: null,
      description: "Deposit",
      accountId: "00000000-0000-4000-8000-000000000021",
      accountAlias: null,
      accountType: "checking" as const,
      currency: "CLP" as const,
      tag: null,
      tagDecisionOrigin: "unreviewed" as const,
      tagRuleId: null,
      reviewStatus: "needs_review" as const,
    };
    const pageInfo = { nextCursor, hasMore: nextCursor !== null };
    const query = vi.fn<ListQuery>(async () => ({
      items: [record],
      pageInfo,
    }));
    const user = vi.fn(() => ({ transactions: { list: { query } } }));
    const service = new TransactionsService({
      user,
    } as unknown as PersistenceClient);
    const input = { limit: 1, cursor: "previous-page" };

    const result = await service.listForUser(userId, input);
    expect(result).toEqual({
      items: [
        {
          id: firstId,
          bookedAt: record.bookedAt,
          amount: record.amount,
          type: "credit",
          merchant: null,
          description: "Deposit",
          account: {
            id: record.accountId,
            alias: null,
            type: "checking",
            currency: "CLP",
          },
          tag: null,
          tagDecisionOrigin: "unreviewed",
          tagRuleId: null,
          reviewStatus: "needs_review",
        },
      ],
      pageInfo,
    });
    expect(result.pageInfo).toBe(pageInfo);
    expect(user).toHaveBeenCalledWith(userId);
    expect(query).toHaveBeenCalledWith(input);
  });
});
