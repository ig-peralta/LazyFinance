import {
  type TransactionsInput,
  TransactionsInputSchema,
} from "@lazyfinance/contracts";
import {
  EmptyInputSchema,
  MovementAggregatesSchema,
  type PeriodInput,
  PeriodInputSchema,
  RecentTransactionRecordsSchema,
  TaggedMovementAggregatesSchema,
  TransactionRecordsPageSchema,
} from "@lazyfinance/contracts/internal";
import { Input, Query, Router } from "nestjs-trpc";
import { wireValue } from "../../serialization";
import { TransactionRepository } from "./transaction.repository";

@Router({ alias: "transactions" })
export class TransactionRpc {
  constructor(private readonly repository: TransactionRepository) {}

  @Query({
    input: EmptyInputSchema,
    output: RecentTransactionRecordsSchema,
    meta: { context: "user" },
  })
  async recent() {
    return wireValue(await this.repository.recent());
  }

  @Query({
    input: TransactionsInputSchema,
    output: TransactionRecordsPageSchema,
    meta: { context: "user" },
  })
  async list(@Input() input: TransactionsInput) {
    return wireValue(await this.repository.list(input));
  }

  @Query({
    input: PeriodInputSchema,
    output: MovementAggregatesSchema,
    meta: { context: "user" },
  })
  async aggregates(@Input() period: PeriodInput) {
    return this.repository.aggregates(period);
  }

  @Query({
    input: PeriodInputSchema,
    output: TaggedMovementAggregatesSchema,
    meta: { context: "user" },
  })
  taggedAggregates(@Input() period: PeriodInput) {
    return this.repository.taggedAggregates(period);
  }
}
