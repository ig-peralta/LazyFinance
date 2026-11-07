import {
  type ExpenseAdjustmentPair,
  ExpenseAdjustmentPairSchema,
  ExpenseAdjustmentSchema,
  type ExpenseAdjustmentsInput,
  ExpenseAdjustmentsInputSchema,
  ExpenseAdjustmentsPageSchema,
  type SetExpenseAdjustment,
  SetExpenseAdjustmentSchema,
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
  VoidResultSchema,
} from "@lazyfinance/contracts/internal";
import { Input, Mutation, Query, Router } from "nestjs-trpc";
import { wireValue } from "../../serialization";
import { ExpenseAdjustmentRepository } from "../expense-adjustment/expense-adjustment.repository";
import { TransactionRepository } from "./transaction.repository";

@Router({ alias: "transactions" })
export class TransactionRpc {
  constructor(
    private readonly repository: TransactionRepository,
    private readonly adjustments: ExpenseAdjustmentRepository,
  ) {}

  @Query({
    input: ExpenseAdjustmentsInputSchema,
    output: ExpenseAdjustmentsPageSchema,
    meta: { context: "user", snapshot: true },
  })
  async expenseAdjustments(@Input() input: ExpenseAdjustmentsInput) {
    return wireValue(await this.adjustments.list(input));
  }

  @Mutation({
    input: SetExpenseAdjustmentSchema,
    output: ExpenseAdjustmentSchema,
    meta: { context: "user" },
  })
  async setExpenseAdjustment(@Input() input: SetExpenseAdjustment) {
    return wireValue(await this.adjustments.set(input));
  }

  @Mutation({
    input: ExpenseAdjustmentPairSchema,
    output: VoidResultSchema,
    meta: { context: "user" },
  })
  removeExpenseAdjustment(@Input() input: ExpenseAdjustmentPair) {
    return this.adjustments.remove(input);
  }

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
