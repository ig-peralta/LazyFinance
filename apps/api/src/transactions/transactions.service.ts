import {
  type ExpenseAdjustmentPair,
  type ExpenseAdjustmentsInput,
  type RecentTransaction,
  SetExpenseAdjustmentSchema,
  type TransactionsInput,
  type TransactionsPage,
} from "@lazyfinance/contracts";
import type { RecentTransactionRecord } from "@lazyfinance/contracts/internal";
import { Injectable } from "@nestjs/common";
import { PersistenceClient } from "../persistence/persistence.client";
import { fromCents, toCents } from "../utils/money";
import { parseInput } from "../validation/parse-input";

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

  expenseAdjustmentsForUser(userId: string, input: ExpenseAdjustmentsInput) {
    return this.persistence
      .user(userId)
      .transactions.expenseAdjustments.query(input);
  }

  setExpenseAdjustmentForUser(userId: string, value: unknown) {
    const input = parseInput(
      SetExpenseAdjustmentSchema,
      value,
      "Invalid expense adjustment",
    );
    input.amount = fromCents(toCents(input.amount));
    return this.persistence
      .user(userId)
      .transactions.setExpenseAdjustment.mutate(input);
  }

  removeExpenseAdjustmentForUser(userId: string, input: ExpenseAdjustmentPair) {
    return this.persistence
      .user(userId)
      .transactions.removeExpenseAdjustment.mutate(input);
  }

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
