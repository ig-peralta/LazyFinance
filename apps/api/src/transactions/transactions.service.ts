import type { RecentTransaction } from "@lazyfinance/contracts";
import { Injectable } from "@nestjs/common";
import { PersistenceClient } from "../persistence/persistence.client";

@Injectable()
export class TransactionsService {
  constructor(private readonly persistence: PersistenceClient) {}

  async getRecentForUser(userId: string): Promise<RecentTransaction[]> {
    const rows = await this.persistence
      .user(userId)
      .transactions.recent.query();
    return rows.map(
      ({ accountId, accountAlias, accountType, currency, ...item }) => ({
        ...item,
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
