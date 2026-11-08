import type {
  IncomeFacts,
  IncomeSourceRecord,
} from "@lazyfinance/contracts/internal";
import { describe, expect, it } from "vitest";
import { movementAggregate } from "../../tests/fixtures/movement-aggregate";
import type { RpcStubs } from "../../tests/fixtures/rpc-stubs";
import type { PersistenceClient } from "../persistence/persistence.client";
import { IncomeService } from "./income.service";

const now = new Date("2026-09-16T15:00:00.000Z");
const source: IncomeSourceRecord = {
  id: "source",
  userId: "owner",
  name: "Salary",
  currency: "CLP",
  regularity: "regular",
  amountKind: "fixed",
  expectedAmount: "150.01",
  schedule: { frequency: "monthly", day: 25 },
  startDate: "2026-01-01",
  endDate: null,
  archivedAt: null,
  createdAt: now.toISOString(),
  updatedAt: now.toISOString(),
};
const receipt: IncomeFacts["receipts"][number] = {
  transactionId: "received",
  sourceId: source.id,
  sourceName: source.name,
  bookedAt: "2026-09-15T15:00:00.000Z",
  amount: "100.02",
  confirmedAt: now.toISOString(),
  type: "credit",
  isInternalMovement: false,
  reviewStatus: "clear",
  removedAt: null,
  hasExpenseAdjustments: false,
};

type IncomeClient = RpcStubs<ReturnType<PersistenceClient["user"]>["income"]>;

type IncomeReads = {
  [Method in "expectedFacts" | "receipts" | "facts"]?: Pick<
    IncomeClient[Method],
    "query"
  >;
};

const service = (income: IncomeReads) =>
  new IncomeService({
    user: () => ({ income }),
  } as unknown as PersistenceClient);

describe("IncomeService factual reads", () => {
  it("calculates full-month expectations using declaration facts without loading receipts or movement aggregates", async () => {
    const income = service({
      expectedFacts: {
        query: async () => ({ sources: [source], expectations: [] }),
      },
    });
    const expected = await income.getExpectedForUser("owner", "2026-09");
    expect(expected.totals).toEqual({
      amount: "150.01",
      estimatedAmount: "0.00",
      unknownAmountCount: 0,
      paymentCount: 1,
    });
    expect(expected.payments[0].date).toBe("2026-09-25");
  });

  it("only exposes eligible confirmed credits from the narrow receipt read", async () => {
    const income = service({
      receipts: {
        query: async () => [
          receipt,
          { ...receipt, transactionId: "internal", isInternalMovement: true },
          { ...receipt, transactionId: "unknown", isInternalMovement: null },
          { ...receipt, transactionId: "review", reviewStatus: "needs_review" },
          {
            ...receipt,
            transactionId: "removed",
            removedAt: now.toISOString(),
          },
          { ...receipt, transactionId: "debit", type: "debit" },
          {
            ...receipt,
            transactionId: "adjustment",
            hasExpenseAdjustments: true,
          },
        ],
      },
    });
    await expect(
      income.listReceiptsForUser("owner", "2026-09", now),
    ).resolves.toEqual([
      {
        transactionId: receipt.transactionId,
        sourceId: source.id,
        sourceName: source.name,
        bookedAt: receipt.bookedAt,
        amount: receipt.amount,
        confirmedAt: receipt.confirmedAt,
      },
    ]);
  });

  it("keeps expected, received and unclassified income separate in the complete snapshot", async () => {
    const facts: IncomeFacts = {
      sources: [source],
      expectations: [],
      receipts: [receipt],
      aggregates: [
        movementAggregate({
          type: "credit",
          isInternalMovement: false,
          reviewStatus: "clear",
          hasReceipt: true,
          amount: "100.02",
          count: 1,
        }),
        movementAggregate({
          type: "credit",
          isInternalMovement: false,
          reviewStatus: "clear",
          hasReceipt: false,
          amount: "20.03",
          count: 2,
        }),
      ],
    };
    const income = service({ facts: { query: async () => facts } });
    await expect(
      income.getSummaryForUser("owner", "2026-09", now),
    ).resolves.toMatchObject({
      expectedIncome: { amount: "150.01" },
      receivedIncome: "100.02",
      unclassifiedCredits: { amount: "20.03", count: 2 },
      expectedPayments: [{ date: "2026-09-25" }],
    });
  });
});
