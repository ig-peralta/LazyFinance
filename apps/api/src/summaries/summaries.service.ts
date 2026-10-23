import type { MonthlyComparison, MonthlySummary } from '@lazyfinance/contracts';
import { Injectable } from '@nestjs/common';
import { fromCents, toCents } from '../_utils/money';
import { santiagoMonth, santiagoParts } from '../_utils/santiago-time';
import { monthBounds, previousMonth } from '../drizzle/repositories/financial-filters';
import { TagRepository } from '../drizzle/repositories/tag.repository';
import { TransactionRepository } from '../drizzle/repositories/transaction.repository';
import { IncomeService } from '../income/income.service';

@Injectable()
export class SummariesService {
  constructor(
    private readonly transactions: TransactionRepository,
    private readonly tags: TagRepository,
    private readonly income: IncomeService,
  ) {}

  async getMonthlyForUser(userId: string, month: string, now = new Date()): Promise<MonthlySummary> {
    const asOf = month === santiagoMonth(now) ? now : undefined;
    const [totals, tags, expected] = await Promise.all([
      asOf ? this.transactions.sumByMonthForUser(userId, month, asOf) : this.transactions.sumByMonthForUser(userId, month),
      asOf ? this.tags.sumDebitsByTagForMonth(userId, month, asOf) : this.tags.sumDebitsByTagForMonth(userId, month),
      this.income.getExpectedForUser(userId, month),
    ]);

    return {
      month,
      expectedIncome: expected.totals,
      receivedIncome: totals.receivedIncome,
      unclassifiedCredits: { amount: totals.unclassifiedCreditAmount, count: totals.unclassifiedCreditCount },
      spending: totals.spending,
      unresolvedMovementCount: totals.unresolvedMovementCount ?? 0,
      tags,
    };
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
      receivedIncome: {
        current: current.receivedIncome,
        previous: earlier.receivedIncome,
        change: fromCents(toCents(current.receivedIncome) - toCents(earlier.receivedIncome)),
      },
      spending: {
        current: current.spending,
        previous: earlier.spending,
        change: fromCents(toCents(current.spending) - toCents(earlier.spending)),
      },
      unresolvedMovementCount: {
        current: current.unresolvedMovementCount ?? 0,
        previous: earlier.unresolvedMovementCount ?? 0,
      },
    };
  }
}
