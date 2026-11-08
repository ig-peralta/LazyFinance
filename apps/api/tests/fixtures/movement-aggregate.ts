import type { MovementAggregate } from "@lazyfinance/contracts/internal";

export function movementAggregate(
  update: Partial<MovementAggregate> = {},
): MovementAggregate {
  const row = {
    type: "credit" as const,
    isInternalMovement: false,
    reviewStatus: "clear" as const,
    hasReceipt: false,
    amount: "10.01",
    count: 1,
    refundAmount: "0.00",
    reimbursementAmount: "0.00",
    purchaseAdjustmentReviewCount: 0,
    reservedCreditAmount: "0.00",
    expenseCreditAmount: "0.00",
    expenseCreditCount: 0,
    creditAdjustmentReviewCount: 0,
    ...update,
  };
  return {
    ...row,
    unclassifiedCreditCount:
      update.unclassifiedCreditCount ??
      (row.type === "credit" && !row.hasReceipt ? row.count : 0),
  };
}
