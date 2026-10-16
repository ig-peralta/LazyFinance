import type { MonthlyComparison, MonthlySummary } from '@lazyfinance/contracts';
import { Injectable } from '@nestjs/common';
import { fromCents, toCents } from '../_utils/money';
import { santiagoMonth, santiagoParts } from '../_utils/santiago-time';
import { monthBounds, previousMonth } from '../drizzle/repositories/financial-filters';
import { TagRepository } from '../drizzle/repositories/tag.repository';
import { TransactionRepository } from '../drizzle/repositories/transaction.repository';

@Injectable()
export class SummariesService {
  constructor(
    private readonly transactions: TransactionRepository,
    private readonly tags: TagRepository,
  ) {}

  async getMonthlyForUser(userId: string, month: string, now = new Date()): Promise<MonthlySummary> {
    const asOf = month === santiagoMonth(now) ? now : undefined;
    const [totals, tags] = await Promise.all([
      asOf ? this.transactions.sumByMonthForUser(userId, month, asOf) : this.transactions.sumByMonthForUser(userId, month),
      asOf ? this.tags.sumDebitsByTagForMonth(userId, month, asOf) : this.tags.sumDebitsByTagForMonth(userId, month),
    ]);

    return { month, income: totals.income, spending: totals.spending, tags };
  }

  async getComparisonForUser(userId: string, month: string, now = new Date()): Promise<MonthlyComparison> {
    const previous = previousMonth(month);
    const partial = month === santiagoMonth(now);
    const { day, hour, minute, second } = santiagoParts(now);
    const previousYear = Number(previous.slice(0, 4));
    const previousNumber = Number(previous.slice(5, 7));
    const previousDays = new Date(Date.UTC(previousYear, previousNumber, 0)).getUTCDate();
    const previousEnd = Number(day) > previousDays
      ? monthBounds(previous).end
      : `${previous}-${day} ${hour}:${minute}:${second}`;
    const [current, earlier] = await Promise.all([
      partial ? this.transactions.sumByMonthForUser(userId, month, now) : this.transactions.sumByMonthForUser(userId, month),
      partial
        ? this.transactions.sumForPeriod(userId, monthBounds(previous).start, previousEnd)
        : this.transactions.sumByMonthForUser(userId, previous),
    ]);

    return {
      month,
      previousMonth: previous,
      partial,
      income: {
        current: current.income,
        previous: earlier.income,
        change: fromCents(toCents(current.income) - toCents(earlier.income)),
      },
      spending: {
        current: current.spending,
        previous: earlier.spending,
        change: fromCents(toCents(current.spending) - toCents(earlier.spending)),
      },
    };
  }
}
