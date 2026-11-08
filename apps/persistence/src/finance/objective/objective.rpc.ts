import {
  BudgetDetailSchema,
  type BudgetHistoryInput,
  BudgetHistoryInputSchema,
  BudgetHistoryPageSchema,
  type BudgetVersionInput,
  BudgetVersionInputSchema,
  SavingsGoalSchema,
  type SavingsGoalVersion,
  SavingsGoalVersionSchema,
  type SavingsHistoryInput,
  SavingsHistoryInputSchema,
  SavingsHistoryPageSchema,
} from "@lazyfinance/contracts";
import {
  BudgetPeriodInputSchema,
  BudgetPeriodRecordsSchema,
  type BudgetSpendingEvidenceInput,
  BudgetSpendingEvidenceInputSchema,
  type CreateBudgetCommand,
  CreateBudgetCommandSchema,
  type CreateSavingsCommand,
  CreateSavingsCommandSchema,
  EmptyInputSchema,
  IdInputSchema,
  ObjectiveRecordsSchema,
  ObjectiveSpendingFactsSchema,
  type ObjectiveSpendingInput,
  ObjectiveSpendingInputSchema,
  type SavingsEvidenceRead,
  SavingsEvidenceReadSchema,
  SavingsEvidenceRecordsSchema,
  SavingsFactsSchema,
  type SavingsRead,
  SavingsReadSchema,
  SpendingEvidenceFactsSchema,
  type UpdateBudgetCommand,
  UpdateBudgetCommandSchema,
  type UpdateSavingsCommand,
  UpdateSavingsCommandSchema,
} from "@lazyfinance/contracts/internal";
import { Input, Mutation, Query, Router } from "nestjs-trpc";
import { wireValue } from "../../serialization";
import { SavingsGoalRepository } from "../savings-goal/savings-goal.repository";
import { SavingsReadRepository } from "../savings-goal/savings-read.repository";
import { SpendingEvidenceRepository } from "../spending-evidence/spending-evidence.repository";
import { BudgetRepository } from "./budget.repository";
import { ObjectiveRepository } from "./objective.repository";

@Router({ alias: "objectives" })
export class ObjectiveRpc {
  constructor(
    private readonly repository: ObjectiveRepository,
    private readonly budgets: BudgetRepository,
    private readonly savings: SavingsGoalRepository,
    private readonly measuredSavings: SavingsReadRepository,
    private readonly evidence: SpendingEvidenceRepository,
  ) {}

  @Query({
    input: BudgetSpendingEvidenceInputSchema,
    output: SpendingEvidenceFactsSchema,
    meta: { context: "user", snapshot: true },
  })
  budgetEvidence(@Input() input: BudgetSpendingEvidenceInput) {
    return this.evidence.budget(input);
  }

  @Query({
    input: SavingsReadSchema,
    output: SavingsFactsSchema,
    meta: { context: "user", snapshot: true },
  })
  async savingsFacts(@Input() input: SavingsRead) {
    return wireValue(await this.measuredSavings.facts(input));
  }

  @Query({
    input: SavingsEvidenceReadSchema,
    output: SavingsEvidenceRecordsSchema,
    meta: { context: "user", snapshot: true },
  })
  savingsEvidence(@Input() input: SavingsEvidenceRead) {
    return this.measuredSavings.evidence(input);
  }

  @Query({
    input: IdInputSchema,
    output: SavingsGoalSchema,
    meta: { context: "user", snapshot: true },
  })
  savingsGoal(@Input() input: { id: string }) {
    return this.savings.detail(input.id);
  }

  @Query({
    input: SavingsHistoryInputSchema,
    output: SavingsHistoryPageSchema,
    meta: { context: "user", snapshot: true },
  })
  savingsGoalHistory(@Input() input: SavingsHistoryInput) {
    return this.savings.history(input);
  }

  @Mutation({
    input: CreateSavingsCommandSchema,
    output: SavingsGoalSchema,
    meta: { context: "user" },
  })
  createSavingsGoal(@Input() input: CreateSavingsCommand) {
    return this.savings.create(input);
  }

  @Mutation({
    input: UpdateSavingsCommandSchema,
    output: SavingsGoalSchema,
    meta: { context: "user" },
  })
  updateSavingsGoal(@Input() input: UpdateSavingsCommand) {
    return this.savings.update(input);
  }

  @Mutation({
    input: SavingsGoalVersionSchema,
    output: SavingsGoalSchema,
    meta: { context: "user" },
  })
  archiveSavingsGoal(@Input() input: SavingsGoalVersion) {
    return this.savings.archive(input);
  }

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
  forPeriod(@Input() input: { before: string; id?: string }) {
    return this.repository.forPeriod(input.before, input.id);
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
