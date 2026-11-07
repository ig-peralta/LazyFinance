import type { MovementAggregate } from "@lazyfinance/contracts/internal";
import { fromCents, toCents } from "../utils/money";

export function movementTotals(groups: MovementAggregate[]) {
  let received = 0n,
    unclassified = 0n,
    spending = 0n,
    unclassifiedCount = 0,
    unresolved = 0;

  for (const group of groups) {
    if (
      group.isInternalMovement === null ||
      group.reviewStatus === "needs_review"
    )
      unresolved += group.count;

    if (group.isInternalMovement !== false || group.reviewStatus !== "clear")
      continue;

    if (group.type === "debit") spending -= toCents(group.amount);
    else if (group.hasReceipt) received += toCents(group.amount);
    else {
      unclassified += toCents(group.amount);
      unclassifiedCount += group.count;
    }
  }

  return {
    receivedIncome: fromCents(received),
    unclassifiedCredits: {
      amount: fromCents(unclassified),
      count: unclassifiedCount,
    },
    spending: fromCents(spending),
    unresolvedMovementCount: unresolved,
  };
}
