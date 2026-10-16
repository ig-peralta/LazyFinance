import type { MonthlyComparison, MonthlySummary } from '@lazyfinance/contracts';
import { Injectable } from '@nestjs/common';
import { fromCents, toCents } from '../_utils/money';
import { previousMonth } from '../drizzle/repositories/financial-filters';
import { TagRepository } from '../drizzle/repositories/tag.repository';
import { TransactionRepository } from '../drizzle/repositories/transaction.repository';

@Injectable()
export class SummariesService {
  constructor(
    private readonly transactions: TransactionRepository,
    private readonly tags: TagRepository,
  ) {}

  async getMonthlyForUser(userId: string, month: string): Promise<MonthlySummary> {
    const [totals, tags] = await Promise.all([
      this.transactions.sumByMonthForUser(userId, month),
      this.tags.sumDebitsByTagForMonth(userId, month),
    ]);

    return { month, income: totals.income, spending: totals.spending, tags };
  }

  async getComparisonForUser(userId: string, month: string): Promise<MonthlyComparison> {
    const previous = previousMonth(month);
    const [current, earlier] = await Promise.all([
      this.transactions.sumByMonthForUser(userId, month),
      this.transactions.sumByMonthForUser(userId, previous),
    ]);

    return {
      month,
      previousMonth: previous,
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
