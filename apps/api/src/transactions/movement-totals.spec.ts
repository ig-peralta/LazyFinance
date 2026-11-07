import type { MovementAggregate } from "@lazyfinance/contracts/internal";
import { describe, expect, it } from "vitest";
import { movementTotals } from "./movement-totals";

function group(update: Partial<MovementAggregate>): MovementAggregate {
  return {
    type: "credit",
    isInternalMovement: false,
    reviewStatus: "clear",
    hasReceipt: false,
    tagId: null,
    amount: "10.01",
    count: 1,
    ...update,
  };
}

describe("movementTotals", () => {
  it("separates confirmed receipts, other credits and spending with exact money arithmetic", () => {
    expect(
      movementTotals([
        group({ hasReceipt: true, amount: "9007199254740.99" }),
        group({ amount: "2.02", count: 2 }),
        group({ type: "debit", amount: "-20.03" }),
        group({ isInternalMovement: true, amount: "1000.00" }),
        group({ isInternalMovement: null, count: 3 }),
        group({ reviewStatus: "needs_review", hasReceipt: true, count: 2 }),
      ]),
    ).toEqual({
      receivedIncome: "9007199254740.99",
      unclassifiedCredits: { amount: "2.02", count: 2 },
      spending: "20.03",
      unresolvedMovementCount: 5,
    });
  });

  it("counts uncertain reviewed movements once and never includes their amounts", () => {
    expect(
      movementTotals([
        group({
          isInternalMovement: null,
          reviewStatus: "needs_review",
          count: 3,
        }),
      ]),
    ).toEqual({
      receivedIncome: "0.00",
      unclassifiedCredits: { amount: "0.00", count: 0 },
      spending: "0.00",
      unresolvedMovementCount: 3,
    });
  });

  it("returns exact zero totals for an empty period", () => {
    expect(movementTotals([])).toEqual({
      receivedIncome: "0.00",
      unclassifiedCredits: { amount: "0.00", count: 0 },
      spending: "0.00",
      unresolvedMovementCount: 0,
    });
  });
});
