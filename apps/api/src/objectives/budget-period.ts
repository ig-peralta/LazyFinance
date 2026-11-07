import type { ObjectiveSummary } from "@lazyfinance/contracts";
import { monthBounds } from "../utils/period";
import { santiagoTimestamp } from "../utils/santiago-time";

export type BudgetPeriod = "monthly" | "yearly" | "fixed";

export function budgetPeriod(
  objective: Pick<
    ObjectiveSummary,
    "intent" | "kind" | "isRecurring" | "period" | "startDate" | "endDate"
  >,
  month: string,
): { start: string; end: string; period: BudgetPeriod } | null {
  if (objective.intent !== "spending" || objective.kind !== "time_based")
    return null;

  const { start: monthStart, end: monthEnd } = monthBounds(month);
  const startsAt = objective.startDate
    ? santiagoTimestamp(new Date(objective.startDate))
    : null;
  const endsAt = objective.endDate
    ? santiagoTimestamp(new Date(objective.endDate))
    : null;
  let start: string;
  let end = monthEnd;
  let period: BudgetPeriod;

  if (objective.isRecurring && objective.period === "monthly") {
    start = monthStart;
    period = "monthly";
  } else if (objective.isRecurring && objective.period === "yearly") {
    start = `${month.slice(0, 4)}-01-01 00:00:00`;
    period = "yearly";
  } else if (objective.isRecurring === false && startsAt && endsAt) {
    start = startsAt;
    period = "fixed";
  } else {
    return null;
  }

  if (startsAt) start = start > startsAt ? start : startsAt;

  if (endsAt) end = end < endsAt ? end : endsAt;

  if (start >= end || start >= monthEnd || (endsAt && endsAt <= monthStart))
    return null;

  return { start, end, period };
}
