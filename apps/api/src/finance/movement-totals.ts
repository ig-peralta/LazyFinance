import type { MovementAggregate } from "@lazyfinance/contracts/internal";
import { fromCents, toCents } from "../utils/money";

export function movementTotals(groups: MovementAggregate[]) {
  let received = 0n,
    unclassified = 0n,
    spending = 0n,
    refunds = 0n,
    reimbursements = 0n,
    recoveredCredits = 0n,
    recoveredCreditCount = 0,
    creditReviewCount = 0,
    adjustmentReviewCount = 0,
    unclassifiedCount = 0,
    unresolved = 0;

  for (const group of groups) {
    adjustmentReviewCount += group.purchaseAdjustmentReviewCount;
    creditReviewCount += group.creditAdjustmentReviewCount;
    if (
      group.isInternalMovement === null ||
      group.reviewStatus === "needs_review"
    )
      unresolved += group.count;

    if (group.isInternalMovement !== false || group.reviewStatus !== "clear")
      continue;

    if (group.type === "debit") {
      spending -= toCents(group.amount);
      refunds += toCents(group.refundAmount);
      reimbursements += toCents(group.reimbursementAmount);
    } else if (group.hasReceipt) received += toCents(group.amount);
    else {
      unclassified +=
        toCents(group.amount) - toCents(group.reservedCreditAmount);
      unclassifiedCount += group.unclassifiedCreditCount;
      recoveredCredits += toCents(group.expenseCreditAmount);
      recoveredCreditCount += group.expenseCreditCount;
    }
  }

  return {
    receivedIncome: fromCents(received),
    unclassifiedCredits: {
      amount: fromCents(unclassified),
      count: unclassifiedCount,
    },
    spending: fromCents(spending - refunds - reimbursements),
    grossSpending: fromCents(spending),
    refunds: fromCents(refunds),
    reimbursements: fromCents(reimbursements),
    unresolvedAdjustmentCount: adjustmentReviewCount,
    recoveredExpenseCredits: {
      amount: fromCents(recoveredCredits),
      count: recoveredCreditCount,
      needsReviewCount: creditReviewCount,
    },
    unresolvedMovementCount: unresolved,
  };
}
