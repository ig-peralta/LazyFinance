import type { FinancialAction } from "@lazyfinance/contracts";

const statusOrder = {
  proposed: 0,
  stale: 1,
  expired: 1,
  cancelled: 2,
  applied: 3,
};

/** Delayed history cannot undo a newer revision or an authoritative receipt. */
export function latestAssistantAction(
  current: FinancialAction,
  incoming: FinancialAction,
) {
  if (current.version !== incoming.version)
    return current.version > incoming.version ? current : incoming;
  return statusOrder[current.status] > statusOrder[incoming.status]
    ? current
    : incoming;
}
