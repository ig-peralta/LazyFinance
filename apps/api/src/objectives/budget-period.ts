import { monthBounds } from '../drizzle/repositories/financial-filters';
import { santiagoTimestamp } from '../_utils/santiago-time';

export type BudgetPeriod = 'monthly' | 'yearly' | 'fixed';

export function budgetPeriod(
  objective: {
    intent: string; kind: string; isRecurring: boolean | null; period: string | null;
    startDate: Date | null; endDate: Date | null;
  },
  month: string,
): { start: string; end: string; period: BudgetPeriod } | null {
  if (objective.intent !== 'spending' || objective.kind !== 'time_based') return null;
  const { start: monthStart, end: monthEnd } = monthBounds(month);
  let start: string;
  let end = monthEnd;
  let period: BudgetPeriod;

  if (objective.isRecurring && objective.period === 'monthly') {
    start = monthStart;
    period = 'monthly';
  } else if (objective.isRecurring && objective.period === 'yearly') {
    start = `${month.slice(0, 4)}-01-01 00:00:00`;
    period = 'yearly';
  } else if (objective.isRecurring === false && objective.startDate && objective.endDate) {
    start = santiagoTimestamp(objective.startDate);
    period = 'fixed';
  } else {
    return null;
  }

  if (objective.startDate) start = start > santiagoTimestamp(objective.startDate) ? start : santiagoTimestamp(objective.startDate);
  if (objective.endDate) end = end < santiagoTimestamp(objective.endDate) ? end : santiagoTimestamp(objective.endDate);
  if (start >= end || start >= monthEnd || (objective.endDate && santiagoTimestamp(objective.endDate) <= monthStart)) return null;

  return { start, end, period };
}
