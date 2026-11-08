import type { MovementAggregate } from "@lazyfinance/contracts/internal";
import { describe, expect, it } from "vitest";
import { movementAggregate } from "../../tests/fixtures/movement-aggregate";
import { movementTotals } from "./movement-totals";

function group(update: Partial<MovementAggregate>): MovementAggregate {
  return movementAggregate({
    type: "credit",
    isInternalMovement: false,
    reviewStatus: "clear",
    hasReceipt: false,
    amount: "10.01",
    count: 1,
    ...update,
  });
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
      grossSpending: "20.03",
      refunds: "0.00",
      reimbursements: "0.00",
      unresolvedAdjustmentCount: 0,
      recoveredExpenseCredits: {
        amount: "0.00",
        count: 0,
        needsReviewCount: 0,
      },
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
      grossSpending: "0.00",
      refunds: "0.00",
      reimbursements: "0.00",
      unresolvedAdjustmentCount: 0,
      recoveredExpenseCredits: {
        amount: "0.00",
        count: 0,
        needsReviewCount: 0,
      },
      unresolvedMovementCount: 3,
    });
  });

  it("returns exact zero totals for an empty period", () => {
    expect(movementTotals([])).toEqual({
      receivedIncome: "0.00",
      unclassifiedCredits: { amount: "0.00", count: 0 },
      spending: "0.00",
      grossSpending: "0.00",
      refunds: "0.00",
      reimbursements: "0.00",
      unresolvedAdjustmentCount: 0,
      recoveredExpenseCredits: {
        amount: "0.00",
        count: 0,
        needsReviewCount: 0,
      },
      unresolvedMovementCount: 0,
    });
  });

  it("keeps recovered cash separate from expense attribution and reserves invalid allocations", () => {
    expect(
      movementTotals([
        group({
          type: "debit",
          amount: "-100.03",
          refundAmount: "30.01",
          reimbursementAmount: "20.02",
        }),
        group({
          amount: "40.00",
          reservedCreditAmount: "30.00",
          expenseCreditAmount: "20.00",
          expenseCreditCount: 1,
          creditAdjustmentReviewCount: 1,
        }),
      ]),
    ).toMatchObject({
      grossSpending: "100.03",
      refunds: "30.01",
      reimbursements: "20.02",
      spending: "50.00",
      unclassifiedCredits: { amount: "10.00", count: 1 },
      recoveredExpenseCredits: {
        amount: "20.00",
        count: 1,
        needsReviewCount: 1,
      },
    });
  });
});
