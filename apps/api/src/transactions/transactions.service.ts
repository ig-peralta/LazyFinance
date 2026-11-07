import type {
  RecentTransaction,
  TransactionsInput,
  TransactionsPage,
} from "@lazyfinance/contracts";
import type { RecentTransactionRecord } from "@lazyfinance/contracts/internal";
import { Injectable } from "@nestjs/common";
import { PersistenceClient } from "../persistence/persistence.client";

function transactionResponse({
  accountId,
  accountAlias,
  accountType,
  currency,
  ...item
}: RecentTransactionRecord): RecentTransaction {
  return {
    ...item,
    account: {
      id: accountId,
      alias: accountAlias,
      type: accountType,
      currency,
    },
  };
}

@Injectable()
export class TransactionsService {
  constructor(private readonly persistence: PersistenceClient) {}

  async getRecentForUser(userId: string): Promise<RecentTransaction[]> {
    const rows = await this.persistence
      .user(userId)
      .transactions.recent.query();
    return rows.map(transactionResponse);
  }

  async listForUser(
    userId: string,
    input: TransactionsInput,
  ): Promise<TransactionsPage> {
    const page = await this.persistence
      .user(userId)
      .transactions.list.query(input);

    return { ...page, items: page.items.map(transactionResponse) };
  }
}
