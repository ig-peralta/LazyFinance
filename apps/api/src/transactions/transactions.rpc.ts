import {
  type ExpenseAdjustmentPair,
  ExpenseAdjustmentPairSchema,
  ExpenseAdjustmentSchema,
  type ExpenseAdjustmentsInput,
  ExpenseAdjustmentsInputSchema,
  ExpenseAdjustmentsPageSchema,
  InternalMovementDecisionSchema,
  RecentTransactionsResultSchema,
  RpcEmptySchema,
  RpcVoidSchema,
  type SetExpenseAdjustment,
  SetExpenseAdjustmentSchema,
  type SetInternalMovement,
  SetInternalMovementSchema,
  type TransactionsInput,
  TransactionsInputSchema,
  TransactionsPageSchema,
} from "@lazyfinance/contracts";
import { Ctx, Input, Mutation, Query, Router } from "nestjs-trpc";
import { type ApiRequestContext, rpcUser } from "../rpc/context";
import { TransactionsService } from "./transactions.service";

@Router({ alias: "transactions" })
export class TransactionsRpc {
  constructor(private readonly service: TransactionsService) {}

  @Mutation({
    input: SetInternalMovementSchema,
    output: InternalMovementDecisionSchema,
    meta: { auth: "user" },
  })
  setInternalMovement(
    @Ctx() ctx: ApiRequestContext,
    @Input() input: SetInternalMovement,
  ) {
    return this.service.setInternalMovementForUser(rpcUser(ctx), input);
  }

  @Query({
    input: ExpenseAdjustmentsInputSchema,
    output: ExpenseAdjustmentsPageSchema,
    meta: { auth: "user" },
  })
  expenseAdjustments(
    @Ctx() ctx: ApiRequestContext,
    @Input() input: ExpenseAdjustmentsInput,
  ) {
    return this.service.expenseAdjustmentsForUser(rpcUser(ctx), input);
  }

  @Mutation({
    input: SetExpenseAdjustmentSchema,
    output: ExpenseAdjustmentSchema,
    meta: { auth: "user" },
  })
  setExpenseAdjustment(
    @Ctx() ctx: ApiRequestContext,
    @Input() input: SetExpenseAdjustment,
  ) {
    return this.service.setExpenseAdjustmentForUser(rpcUser(ctx), input);
  }

  @Mutation({
    input: ExpenseAdjustmentPairSchema,
    output: RpcVoidSchema,
    meta: { auth: "user" },
  })
  removeExpenseAdjustment(
    @Ctx() ctx: ApiRequestContext,
    @Input() input: ExpenseAdjustmentPair,
  ) {
    return this.service.removeExpenseAdjustmentForUser(rpcUser(ctx), input);
  }

  @Query({
    input: RpcEmptySchema,
    output: RecentTransactionsResultSchema,
    meta: { auth: "user" },
  })
  recent(@Ctx() ctx: ApiRequestContext) {
    return this.service.getRecentForUser(rpcUser(ctx));
  }

  @Query({
    input: TransactionsInputSchema,
    output: TransactionsPageSchema,
    meta: { auth: "user" },
  })
  list(@Ctx() ctx: ApiRequestContext, @Input() input: TransactionsInput) {
    return this.service.listForUser(rpcUser(ctx), input);
  }
}
