import {
  BudgetDetailSchema,
  type BudgetHistoryInput,
  BudgetHistoryInputSchema,
  BudgetHistoryPageSchema,
  BudgetProgressResultSchema,
  type BudgetVersionInput,
  BudgetVersionInputSchema,
  type CreateBudgetInput,
  CreateBudgetInputSchema,
  type CreateSavingsGoal,
  CreateSavingsGoalSchema,
  ObjectivesResultSchema,
  RpcEmptySchema,
  RpcIdSchema,
  RpcMonthSchema,
  type SavingsEvidenceInput,
  SavingsEvidenceInputSchema,
  SavingsEvidencePageSchema,
  SavingsGoalSchema,
  type SavingsGoalVersion,
  SavingsGoalVersionSchema,
  type SavingsHistoryInput,
  SavingsHistoryInputSchema,
  SavingsHistoryPageSchema,
  type SavingsProgressInput,
  SavingsProgressInputSchema,
  SavingsProgressSchema,
  type UpdateBudgetInput,
  UpdateBudgetInputSchema,
  type UpdateSavingsGoal,
  UpdateSavingsGoalSchema,
} from "@lazyfinance/contracts";
import { Ctx, Input, Mutation, Query, Router } from "nestjs-trpc";
import { type ApiRequestContext, rpcUser } from "../rpc/context";
import { checkedMonth } from "../utils/month-query";
import { santiagoMonth } from "../utils/santiago-time";
import { ObjectivesService } from "./objectives.service";
import { SavingsGoalsService } from "./savings-goals.service";
import { SavingsProgressService } from "./savings-progress.service";

@Router({ alias: "objectives" })
export class ObjectivesRpc {
  constructor(
    private readonly service: ObjectivesService,
    private readonly savings: SavingsGoalsService,
    private readonly measuredSavings: SavingsProgressService,
  ) {}

  @Query({
    input: SavingsProgressInputSchema,
    output: SavingsProgressSchema,
    meta: { auth: "user" },
  })
  savingsProgress(
    @Ctx() ctx: ApiRequestContext,
    @Input() input: SavingsProgressInput,
  ) {
    return this.measuredSavings.progress(rpcUser(ctx), input);
  }

  @Query({
    input: SavingsEvidenceInputSchema,
    output: SavingsEvidencePageSchema,
    meta: { auth: "user" },
  })
  savingsContributions(
    @Ctx() ctx: ApiRequestContext,
    @Input() input: SavingsEvidenceInput,
  ) {
    return this.measuredSavings.evidence(rpcUser(ctx), input);
  }

  @Query({
    input: RpcIdSchema,
    output: SavingsGoalSchema,
    meta: { auth: "user" },
  })
  savingsGoal(@Ctx() ctx: ApiRequestContext, @Input() input: { id: string }) {
    return this.savings.detail(rpcUser(ctx), input.id);
  }

  @Query({
    input: SavingsHistoryInputSchema,
    output: SavingsHistoryPageSchema,
    meta: { auth: "user" },
  })
  savingsGoalHistory(
    @Ctx() ctx: ApiRequestContext,
    @Input() input: SavingsHistoryInput,
  ) {
    return this.savings.history(rpcUser(ctx), input);
  }

  @Mutation({
    input: CreateSavingsGoalSchema,
    output: SavingsGoalSchema,
    meta: { auth: "user" },
  })
  createSavingsGoal(
    @Ctx() ctx: ApiRequestContext,
    @Input() input: CreateSavingsGoal,
  ) {
    return this.savings.create(rpcUser(ctx), input);
  }

  @Mutation({
    input: UpdateSavingsGoalSchema,
    output: SavingsGoalSchema,
    meta: { auth: "user" },
  })
  updateSavingsGoal(
    @Ctx() ctx: ApiRequestContext,
    @Input() input: UpdateSavingsGoal,
  ) {
    return this.savings.update(rpcUser(ctx), input);
  }

  @Mutation({
    input: SavingsGoalVersionSchema,
    output: SavingsGoalSchema,
    meta: { auth: "user" },
  })
  archiveSavingsGoal(
    @Ctx() ctx: ApiRequestContext,
    @Input() input: SavingsGoalVersion,
  ) {
    return this.savings.archive(rpcUser(ctx), input);
  }

  @Query({
    input: RpcEmptySchema,
    output: ObjectivesResultSchema,
    meta: { auth: "user" },
  })
  list(@Ctx() ctx: ApiRequestContext) {
    return this.service.getForUser(rpcUser(ctx));
  }

  @Query({
    input: RpcIdSchema,
    output: BudgetDetailSchema,
    meta: { auth: "user" },
  })
  budget(@Ctx() ctx: ApiRequestContext, @Input() input: { id: string }) {
    return this.service.getBudgetForUser(rpcUser(ctx), input.id);
  }

  @Query({
    input: BudgetHistoryInputSchema,
    output: BudgetHistoryPageSchema,
    meta: { auth: "user" },
  })
  budgetHistory(
    @Ctx() ctx: ApiRequestContext,
    @Input() input: BudgetHistoryInput,
  ) {
    return this.service.getBudgetHistoryForUser(rpcUser(ctx), input);
  }

  @Mutation({
    input: CreateBudgetInputSchema,
    output: BudgetDetailSchema,
    meta: { auth: "user" },
  })
  createBudget(
    @Ctx() ctx: ApiRequestContext,
    @Input() input: CreateBudgetInput,
  ) {
    return this.service.createBudgetForUser(rpcUser(ctx), input);
  }

  @Mutation({
    input: UpdateBudgetInputSchema,
    output: BudgetDetailSchema,
    meta: { auth: "user" },
  })
  updateBudget(
    @Ctx() ctx: ApiRequestContext,
    @Input() input: UpdateBudgetInput,
  ) {
    return this.service.updateBudgetForUser(rpcUser(ctx), input);
  }

  @Mutation({
    input: BudgetVersionInputSchema,
    output: BudgetDetailSchema,
    meta: { auth: "user" },
  })
  archiveBudget(
    @Ctx() ctx: ApiRequestContext,
    @Input() input: BudgetVersionInput,
  ) {
    return this.service.archiveBudgetForUser(rpcUser(ctx), input);
  }

  @Query({
    input: RpcMonthSchema,
    output: BudgetProgressResultSchema,
    meta: { auth: "user" },
  })
  progress(@Ctx() ctx: ApiRequestContext, @Input() input: { month?: string }) {
    return this.service.getSpendingProgressForUser(
      rpcUser(ctx),
      checkedMonth(input.month ?? santiagoMonth(new Date())),
    );
  }
}
