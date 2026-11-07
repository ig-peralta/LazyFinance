import type { ObjectiveSummary } from "@lazyfinance/contracts";
import { monthBounds } from "../utils/period";
import { compareObjectiveBoundaries } from "./objective-time";

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
  const startsAt = objective.startDate;
  const endsAt = objective.endDate;
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

  if (startsAt && compareObjectiveBoundaries(startsAt, start) > 0)
    start = startsAt;

  if (endsAt && compareObjectiveBoundaries(endsAt, end) < 0) end = endsAt;

  if (
    compareObjectiveBoundaries(start, end) >= 0 ||
    compareObjectiveBoundaries(start, monthEnd) >= 0 ||
    (endsAt && compareObjectiveBoundaries(endsAt, monthStart) <= 0)
  )
    return null;

  return { start, end, period };
}
