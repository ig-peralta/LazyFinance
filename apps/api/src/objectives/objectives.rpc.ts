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
  ObjectivesResultSchema,
  RpcEmptySchema,
  RpcIdSchema,
  RpcMonthSchema,
  type UpdateBudgetInput,
  UpdateBudgetInputSchema,
} from "@lazyfinance/contracts";
import { Ctx, Input, Mutation, Query, Router } from "nestjs-trpc";
import { type ApiRequestContext, rpcUser } from "../rpc/context";
import { checkedMonth } from "../utils/month-query";
import { santiagoMonth } from "../utils/santiago-time";
import { ObjectivesService } from "./objectives.service";

@Router({ alias: "objectives" })
export class ObjectivesRpc {
  constructor(private readonly service: ObjectivesService) {}

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
