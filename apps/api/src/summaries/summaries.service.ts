import type { MonthlySummary } from '@lazyfinance/contracts';
import { Injectable } from '@nestjs/common';
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
}
