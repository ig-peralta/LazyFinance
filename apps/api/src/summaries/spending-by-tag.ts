import type { TaggedMovementAggregate } from "@lazyfinance/contracts/internal";
import { fromCents, toCents } from "../utils/money";

export function spendingByTag(groups: TaggedMovementAggregate[]) {
  const amounts = new Map<
    string,
    {
      id: string;
      name: string;
      color: string | null;
      cents: bigint;
      refunds: bigint;
      reimbursements: bigint;
      count: number;
    }
  >();

  for (const row of groups) {
    if (
      row.tag === null ||
      row.type !== "debit" ||
      row.isInternalMovement !== false ||
      row.reviewStatus !== "clear"
    )
      continue;

    const total = amounts.get(row.tag.id) ?? {
      ...row.tag,
      cents: 0n,
      refunds: 0n,
      reimbursements: 0n,
      count: 0,
    };
    total.cents -= toCents(row.amount);
    total.refunds += toCents(row.refundAmount);
    total.reimbursements += toCents(row.reimbursementAmount);
    total.count += row.count;
    amounts.set(row.tag.id, total);
  }

  return [...amounts.values()]
    .map(({ cents, refunds, reimbursements, ...tag }) => ({
      ...tag,
      amount: fromCents(cents - refunds - reimbursements),
      grossAmount: fromCents(cents),
      refunds: fromCents(refunds),
      reimbursements: fromCents(reimbursements),
    }))
    .sort((left, right) => {
      const difference = toCents(right.amount) - toCents(left.amount);
      return difference === 0n
        ? left.name.localeCompare(right.name)
        : difference > 0n
          ? 1
          : -1;
    });
}
