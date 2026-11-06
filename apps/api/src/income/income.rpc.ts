import {
  ConfirmIncomeReceiptSchema,
  CreateIncomeExpectationSchema,
  ExpectedIncomeSchema,
  type IncomeExpectationInput,
  IncomeExpectationSchema,
  IncomeExpectationsResultSchema,
  IncomeReceiptSchema,
  IncomeReceiptsResultSchema,
  type IncomeSourceInput,
  IncomeSourceInputSchema,
  IncomeSourceSchema,
  IncomeSourcesResultSchema,
  IncomeSummarySchema,
  ReplaceIncomeExpectationSchema,
  ReplaceIncomeSourceSchema,
  RpcEmptySchema,
  RpcIdSchema,
  RpcMonthSchema,
  RpcVoidSchema,
} from "@lazyfinance/contracts";
import { Inject } from "@nestjs/common";
import { Ctx, Input, Mutation, Query, Router } from "nestjs-trpc";
import type { ApiRequestContext } from "../rpc/api.context";
import { rpcUser } from "../rpc/api.middleware";
import { IncomeService } from "./income.service";

@Router({ alias: "income" })
export class IncomeRpc {
  constructor(@Inject(IncomeService) private readonly service: IncomeService) {}

  @Query({
    input: RpcEmptySchema,
    output: IncomeSourcesResultSchema,
    meta: { auth: "user" },
  })
  sources(@Ctx() ctx: ApiRequestContext) {
    return this.service.listSourcesForUser(rpcUser(ctx));
  }

  @Query({
    input: RpcIdSchema,
    output: IncomeSourceSchema,
    meta: { auth: "user" },
  })
  source(@Ctx() ctx: ApiRequestContext, @Input() input: { id: string }) {
    return this.service.getSourceForUser(rpcUser(ctx), input.id);
  }

  @Mutation({
    input: IncomeSourceInputSchema,
    output: IncomeSourceSchema,
    meta: { auth: "user" },
  })
  createSource(
    @Ctx() ctx: ApiRequestContext,
    @Input() input: IncomeSourceInput,
  ) {
    return this.service.createSourceForUser(rpcUser(ctx), input);
  }

  @Mutation({
    input: ReplaceIncomeSourceSchema,
    output: IncomeSourceSchema,
    meta: { auth: "user" },
  })
  updateSource(
    @Ctx() ctx: ApiRequestContext,
    @Input() input: { id: string; source: IncomeSourceInput },
  ) {
    return this.service.updateSourceForUser(
      rpcUser(ctx),
      input.id,
      input.source,
    );
  }

  @Mutation({
    input: RpcIdSchema,
    output: IncomeSourceSchema,
    meta: { auth: "user" },
  })
  archiveSource(@Ctx() ctx: ApiRequestContext, @Input() input: { id: string }) {
    return this.service.archiveSourceForUser(rpcUser(ctx), input.id);
  }

  @Query({
    input: RpcIdSchema,
    output: IncomeExpectationsResultSchema,
    meta: { auth: "user" },
  })
  expectations(@Ctx() ctx: ApiRequestContext, @Input() input: { id: string }) {
    return this.service.listExpectationsForUser(rpcUser(ctx), input.id);
  }

  @Mutation({
    input: CreateIncomeExpectationSchema,
    output: IncomeExpectationSchema,
    meta: { auth: "user" },
  })
  createExpectation(
    @Ctx() ctx: ApiRequestContext,
    @Input() input: { sourceId: string; expectation: IncomeExpectationInput },
  ) {
    return this.service.createExpectationForUser(
      rpcUser(ctx),
      input.sourceId,
      input.expectation,
    );
  }

  @Mutation({
    input: ReplaceIncomeExpectationSchema,
    output: IncomeExpectationSchema,
    meta: { auth: "user" },
  })
  updateExpectation(
    @Ctx() ctx: ApiRequestContext,
    @Input() input: { id: string; expectation: IncomeExpectationInput },
  ) {
    return this.service.updateExpectationForUser(
      rpcUser(ctx),
      input.id,
      input.expectation,
    );
  }

  @Mutation({
    input: RpcIdSchema,
    output: RpcVoidSchema,
    meta: { auth: "user" },
  })
  removeExpectation(
    @Ctx() ctx: ApiRequestContext,
    @Input() input: { id: string },
  ) {
    return this.service.deleteExpectationForUser(rpcUser(ctx), input.id);
  }

  @Query({
    input: RpcMonthSchema,
    output: ExpectedIncomeSchema,
    meta: { auth: "user" },
  })
  expected(@Ctx() ctx: ApiRequestContext, @Input() input: { month?: string }) {
    return this.service.getExpectedForUser(rpcUser(ctx), input.month);
  }

  @Query({
    input: RpcMonthSchema,
    output: IncomeReceiptsResultSchema,
    meta: { auth: "user" },
  })
  receipts(@Ctx() ctx: ApiRequestContext, @Input() input: { month?: string }) {
    return this.service.listReceiptsForUser(rpcUser(ctx), input.month);
  }

  @Mutation({
    input: ConfirmIncomeReceiptSchema,
    output: IncomeReceiptSchema,
    meta: { auth: "user" },
  })
  confirm(
    @Ctx() ctx: ApiRequestContext,
    @Input() input: { transactionId: string; sourceId: string },
  ) {
    return this.service.confirmReceiptForUser(
      rpcUser(ctx),
      input.transactionId,
      { sourceId: input.sourceId },
    );
  }

  @Mutation({
    input: RpcIdSchema,
    output: RpcVoidSchema,
    meta: { auth: "user" },
  })
  clear(@Ctx() ctx: ApiRequestContext, @Input() input: { id: string }) {
    return this.service.clearReceiptForUser(rpcUser(ctx), input.id);
  }

  @Query({
    input: RpcMonthSchema,
    output: IncomeSummarySchema,
    meta: { auth: "user" },
  })
  summary(@Ctx() ctx: ApiRequestContext, @Input() input: { month?: string }) {
    return this.service.getSummaryForUser(rpcUser(ctx), input.month);
  }
}
