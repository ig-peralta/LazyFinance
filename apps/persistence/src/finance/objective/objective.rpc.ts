import {
  BudgetDetailSchema,
  type BudgetHistoryInput,
  BudgetHistoryInputSchema,
  BudgetHistoryPageSchema,
  type BudgetVersionInput,
  BudgetVersionInputSchema,
} from "@lazyfinance/contracts";
import {
  BudgetPeriodInputSchema,
  BudgetPeriodRecordsSchema,
  type CreateBudgetCommand,
  CreateBudgetCommandSchema,
  EmptyInputSchema,
  IdInputSchema,
  ObjectiveRecordsSchema,
  ObjectiveSpendingFactsSchema,
  type ObjectiveSpendingInput,
  ObjectiveSpendingInputSchema,
  type UpdateBudgetCommand,
  UpdateBudgetCommandSchema,
} from "@lazyfinance/contracts/internal";
import { Input, Mutation, Query, Router } from "nestjs-trpc";
import { wireValue } from "../../serialization";
import { BudgetRepository } from "./budget.repository";
import { ObjectiveRepository } from "./objective.repository";

@Router({ alias: "objectives" })
export class ObjectiveRpc {
  constructor(
    private readonly repository: ObjectiveRepository,
    private readonly budgets: BudgetRepository,
  ) {}

  @Query({
    input: EmptyInputSchema,
    output: ObjectiveRecordsSchema,
    meta: { context: "user" },
  })
  async list() {
    return wireValue(await this.repository.list());
  }

  @Query({
    input: BudgetPeriodInputSchema,
    output: BudgetPeriodRecordsSchema,
    meta: { context: "user" },
  })
  forPeriod(@Input() input: { before: string }) {
    return this.repository.forPeriod(input.before);
  }

  @Query({
    input: IdInputSchema,
    output: BudgetDetailSchema,
    meta: { context: "user", snapshot: true },
  })
  budget(@Input() input: { id: string }) {
    return this.budgets.detail(input.id);
  }

  @Query({
    input: BudgetHistoryInputSchema,
    output: BudgetHistoryPageSchema,
    meta: { context: "user", snapshot: true },
  })
  budgetHistory(@Input() input: BudgetHistoryInput) {
    return this.budgets.history(input);
  }

  @Mutation({
    input: CreateBudgetCommandSchema,
    output: BudgetDetailSchema,
    meta: { context: "user" },
  })
  createBudget(@Input() input: CreateBudgetCommand) {
    return this.budgets.create(input);
  }

  @Mutation({
    input: UpdateBudgetCommandSchema,
    output: BudgetDetailSchema,
    meta: { context: "user" },
  })
  updateBudget(@Input() input: UpdateBudgetCommand) {
    return this.budgets.update(input);
  }

  @Mutation({
    input: BudgetVersionInputSchema,
    output: BudgetDetailSchema,
    meta: { context: "user" },
  })
  archiveBudget(@Input() input: BudgetVersionInput) {
    return this.budgets.archive(input);
  }

  @Query({
    input: ObjectiveSpendingInputSchema,
    output: ObjectiveSpendingFactsSchema,
    meta: { context: "user" },
  })
  spending(@Input() input: ObjectiveSpendingInput) {
    return this.repository.spending(input);
  }
}
