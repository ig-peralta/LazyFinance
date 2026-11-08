import type { RecentTransaction } from "@lazyfinance/contracts";
import type { RecentTransactionRecord } from "@lazyfinance/contracts/internal";

export function movementResponse({
  accountId,
  accountAlias,
  accountType,
  currency,
  ...movement
}: RecentTransactionRecord): RecentTransaction {
  return {
    ...movement,
    account: {
      id: accountId,
      alias: accountAlias,
      type: accountType,
      currency,
    },
  };
}
