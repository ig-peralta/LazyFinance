import type { RecentTransaction } from '@lazyfinance/contracts';
import { Injectable } from '@nestjs/common';
import { TransactionRepository } from '../drizzle/repositories/transaction.repository';

@Injectable()
export class TransactionsService {
  constructor(private readonly transactions: TransactionRepository) {}

  async getRecentForUser(userId: string): Promise<RecentTransaction[]> {
    const rows = await this.transactions.listRecentForUser(userId);
    return rows.map(({ accountId, accountAlias, accountType, currency, bookedAt, ...item }) => ({
      ...item,
      bookedAt: bookedAt.toISOString(),
      account: { id: accountId, alias: accountAlias, type: accountType, currency },
    }));
  }
}
