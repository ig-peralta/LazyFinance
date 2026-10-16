import type { RecentTransaction } from '@lazyfinance/contracts';
import { Injectable } from '@nestjs/common';
import { TagRepository } from '../drizzle/repositories/tag.repository';
import { TransactionRepository } from '../drizzle/repositories/transaction.repository';

@Injectable()
export class TransactionsService {
  constructor(
    private readonly transactions: TransactionRepository,
    private readonly tags: TagRepository,
  ) {}

  async getRecentForUser(userId: string): Promise<RecentTransaction[]> {
    const rows = await this.transactions.listRecentForUser(userId);
    if (rows.length === 0) return [];

    const tagRows = await this.tags.listForTransactions(userId, rows.map(({ id }) => id));
    const tagsByTransaction = new Map<string, RecentTransaction['tags']>();
    for (const { transactionId, ...item } of tagRows) {
      const tags = tagsByTransaction.get(transactionId) ?? [];
      tags.push(item);
      tagsByTransaction.set(transactionId, tags);
    }

    return rows.map(({ accountId, accountAlias, accountType, currency, bookedAt, ...item }) => ({
      ...item,
      bookedAt: bookedAt.toISOString(),
      account: { id: accountId, alias: accountAlias, type: accountType, currency },
      tags: tagsByTransaction.get(item.id) ?? [],
    }));
  }
}
