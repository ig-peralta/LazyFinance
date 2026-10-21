import type { ExpectedIncome, ExpectedIncomePayment, IncomeExpectation } from '@lazyfinance/contracts';
import { fromCents, toCents } from '../_utils/money';
import { santiagoTimestamp } from '../_utils/santiago-time';
import type { IncomeSourceRow } from '../drizzle/schema/income-source.table';

export function expectedIncomeForMonth(
  month: string,
  sources: IncomeSourceRow[],
  expectations: IncomeExpectation[],
): ExpectedIncome {
  const payments: ExpectedIncomePayment[] = [];
  const year = Number(month.slice(0, 4));
  const number = Number(month.slice(5, 7));
  const monthStart = Date.UTC(year, number - 1, 1);
  const monthEnd = Date.UTC(year, number, 1);
  const lastDay = new Date(Date.UTC(year, number, 0)).getUTCDate();

  for (const source of sources) {
    const archiveDate = source.archivedAt ? santiagoTimestamp(source.archivedAt).slice(0, 10) : null;
    const eligibleDate = (date: string) => date.startsWith(`${month}-`) &&
      date >= source.startDate && (!source.endDate || date <= source.endDate) &&
      (!archiveDate || date <= archiveDate);
    const add = (date: string) => {
      if (!eligibleDate(date)) return;
      payments.push({
        sourceId: source.id,
        sourceName: source.name,
        expectationId: null,
        date,
        amount: source.expectedAmount,
        amountType: source.expectedAmount === null ? 'unknown' : source.amountKind === 'variable' ? 'estimated' : 'exact',
      });
    };

    if (source.regularity === 'irregular') {
      for (const expectation of expectations) {
        if (expectation.sourceId !== source.id || !eligibleDate(expectation.date)) continue;
        payments.push({
          sourceId: source.id,
          sourceName: source.name,
          expectationId: expectation.id,
          date: expectation.date,
          amount: expectation.amount,
          amountType: expectation.isEstimate ? 'estimated' : 'exact',
        });
      }
      continue;
    }

    const schedule = source.schedule;
    if (!schedule) continue;
    if (schedule.frequency === 'weekly' || schedule.frequency === 'every_two_weeks') {
      const anchor = Date.parse(`${schedule.anchorDate}T00:00:00Z`);
      const step = (schedule.frequency === 'weekly' ? 7 : 14) * 86_400_000;
      const start = Math.max(monthStart, Date.parse(`${source.startDate}T00:00:00Z`));
      const first = anchor + Math.max(0, Math.ceil((start - anchor) / step)) * step;
      for (let date = first; date < monthEnd; date += step) add(new Date(date).toISOString().slice(0, 10));
    } else if (schedule.frequency === 'monthly' || schedule.frequency === 'twice_monthly') {
      const days = schedule.frequency === 'monthly' ? [schedule.day] : schedule.days;
      for (const day of days) {
        const actualDay = day === 'last' ? lastDay : Math.min(day, lastDay);
        add(`${month}-${String(actualDay).padStart(2, '0')}`);
      }
    }
  }

  payments.sort((left, right) => left.date.localeCompare(right.date) ||
    left.sourceId.localeCompare(right.sourceId) || (left.expectationId ?? '').localeCompare(right.expectationId ?? ''));
  let amount = 0n;
  let estimated = 0n;
  let unknownAmountCount = 0;
  for (const payment of payments) {
    if (payment.amount === null) {
      unknownAmountCount++;
    } else {
      amount += toCents(payment.amount);
      if (payment.amountType === 'estimated') estimated += toCents(payment.amount);
    }
  }
  return {
    month,
    currency: 'CLP',
    totals: { amount: fromCents(amount), estimatedAmount: fromCents(estimated), unknownAmountCount, paymentCount: payments.length },
    payments,
  };
}
