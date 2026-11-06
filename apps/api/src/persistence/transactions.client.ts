import type { MovementAggregate } from "@lazyfinance/contracts/internal";
import { Injectable } from "@nestjs/common";
import { fromCents, toCents } from "../_utils/money";
import { monthBounds } from "../_utils/period";
import { PersistenceClient } from "./persistence.client";

/** Financial interpretation lives here in the API, not in persistence SQL. */
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
    unclassifiedCreditAmount: fromCents(unclassified),
    unclassifiedCreditCount: unclassifiedCount,
    spending: fromCents(spending),
    unresolvedMovementCount: unresolved,
  };
}

@Injectable()
export class TransactionClient {
  constructor(private readonly persistence: PersistenceClient) {}
  async listRecentForUser(userId: string) {
    return (
      await this.persistence.user(userId).transactions.recent.query()
    ).map((row) => ({ ...row, bookedAt: new Date(row.bookedAt) }));
  }
  sumByMonthForUser(userId: string, month: string, asOf?: Date) {
    const { start, end } = monthBounds(month);
    return this.sumForPeriod(userId, start, end, asOf);
  }
  async sumForPeriod(userId: string, start: string, end: string, asOf?: Date) {
    return movementTotals(
      await this.persistence.user(userId).transactions.aggregates.query({
        start,
        end,
        asOf: asOf?.toISOString(),
      }),
    );
  }
  async listTaggedDebitsForPeriod(
    userId: string,
    start: string,
    end: string,
    asOf?: Date,
  ) {
    return (
      await this.persistence.user(userId).transactions.taggedDebits.query({
        start,
        end,
        asOf: asOf?.toISOString(),
      })
    ).map((row) => ({ ...row, bookedAt: new Date(row.bookedAt) }));
  }
}
