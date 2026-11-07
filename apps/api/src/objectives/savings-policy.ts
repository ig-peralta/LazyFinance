import type {
  ProviderAccountRecord,
  TransactionRecord,
} from "@lazyfinance/contracts/internal";
import { fromCents, toCents } from "../utils/money";
import { compareObjectiveBoundaries } from "./objective-time";

export type SavingsMovement = Pick<
  TransactionRecord,
  "tagId" | "bookedAt" | "amount" | "type" | "reviewStatus" | "removedAt"
> & { accountType: ProviderAccountRecord["type"] };

/** Validated Santiago local/UTC bounds; null start means all available history. */
export interface SavingsWindow {
  start: string | null;
  end: string;
  asOf: string;
}

export type SavingsEffect =
  | { status: "applied"; kind: "contribution" | "withdrawal"; amount: string }
  | { status: "pending"; reason: "movement_review" }
  | {
      status: "excluded";
      reason:
        | "unselected_tag"
        | "non_cash_account"
        | "removed"
        | "outside_window";
    };

/**
 * LAZ-35's executable eligibility rule, not a progress endpoint or history reader.
 * Inputs must already be owned, normalized facts. A tag selects a signed cash
 * allocation; internal status, receipt status and history coverage are not gates.
 */
export function savingsEffect(
  movement: SavingsMovement,
  selectedTagIds: ReadonlySet<string>,
  window: SavingsWindow,
): SavingsEffect {
  if (movement.tagId === null || !selectedTagIds.has(movement.tagId))
    return { status: "excluded", reason: "unselected_tag" };
  if (movement.accountType === "credit_card")
    return { status: "excluded", reason: "non_cash_account" };
  if (movement.removedAt !== null)
    return { status: "excluded", reason: "removed" };
  if (
    (window.start !== null &&
      compareObjectiveBoundaries(movement.bookedAt, window.start) < 0) ||
    compareObjectiveBoundaries(movement.bookedAt, window.end) >= 0 ||
    compareObjectiveBoundaries(movement.bookedAt, window.asOf) > 0
  )
    return { status: "excluded", reason: "outside_window" };
  if (movement.reviewStatus === "needs_review")
    return { status: "pending", reason: "movement_review" };

  const amount = toCents(movement.amount);
  const isDebit = amount < 0n;
  if (amount === 0n || isDebit !== (movement.type === "debit"))
    throw new Error("Savings movement amount disagrees with its direction");

  return {
    status: "applied",
    kind: isDebit ? "withdrawal" : "contribution",
    amount: fromCents(amount),
  };
}
