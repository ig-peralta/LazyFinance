import type { RecentTransaction } from "@lazyfinance/contracts";
import { Injectable } from "@nestjs/common";
import { TransactionClient } from "../persistence/transactions.client";

@Injectable()
export class TransactionsService {
  constructor(private readonly transactions: TransactionClient) {}

  async getRecentForUser(userId: string): Promise<RecentTransaction[]> {
    const rows = await this.transactions.listRecentForUser(userId);
    return rows.map(
      ({
        accountId,
        accountAlias,
        accountType,
        currency,
        bookedAt,
        ...item
      }) => ({
        ...item,
        bookedAt: bookedAt.toISOString(),
        account: {
          id: accountId,
          alias: accountAlias,
          type: accountType,
          currency,
        },
      }),
    );
  }
}
