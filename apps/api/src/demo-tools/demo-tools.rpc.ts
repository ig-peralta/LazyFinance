import {
  DemoBankChangeInputSchema,
  DemoBankFailureInputSchema,
  DemoBankFailureResultSchema,
  DemoBankPreparationSchema,
  DemoDataResetInputSchema,
  DemoDataResetResultSchema,
  DemoTransactionInputSchema,
  DemoTransactionResultSchema,
} from "@lazyfinance/contracts";
import { Ctx, Input, Mutation, Query, Router } from "nestjs-trpc";
import { type ApiRequestContext, rpcUser } from "../rpc/context";
import { DemoToolsService } from "./demo-tools.service";

@Router({ alias: "demoTools" })
export class DemoToolsRpc {
  constructor(private readonly tools: DemoToolsService) {}

  @Mutation({
    input: DemoDataResetInputSchema,
    output: DemoDataResetResultSchema,
    meta: { auth: "user" },
  })
  resetDemoData(@Ctx() ctx: ApiRequestContext) {
    return this.tools.resetDemoData(rpcUser(ctx));
  }

  @Mutation({
    input: DemoTransactionInputSchema,
    output: DemoTransactionResultSchema,
    meta: { auth: "user" },
  })
  createInternalTransaction(@Ctx() ctx: ApiRequestContext) {
    return this.tools.createInternalTransaction(rpcUser(ctx));
  }

  @Mutation({
    input: DemoTransactionInputSchema,
    output: DemoTransactionResultSchema,
    meta: { auth: "user" },
  })
  createExternalTransaction(@Ctx() ctx: ApiRequestContext) {
    return this.tools.createExternalTransaction(rpcUser(ctx));
  }

  @Query({
    input: DemoDataResetInputSchema,
    output: DemoBankPreparationSchema,
    meta: { auth: "user" },
  })
  preparation(@Ctx() ctx: ApiRequestContext) {
    return this.tools.preparation(rpcUser(ctx));
  }

  @Mutation({
    input: DemoDataResetInputSchema,
    output: DemoDataResetResultSchema,
    meta: { auth: "user" },
  })
  resumeDemoData(@Ctx() ctx: ApiRequestContext) {
    return this.tools.resumeDemoData(rpcUser(ctx));
  }

  @Mutation({
    input: DemoBankFailureInputSchema,
    output: DemoBankFailureResultSchema,
    meta: { auth: "user" },
  })
  setBankFailure(
    @Ctx() ctx: ApiRequestContext,
    @Input() input: { failure: "retryable" | "expired" | null },
  ) {
    return this.tools.setBankFailure(rpcUser(ctx), input.failure);
  }

  @Mutation({
    input: DemoBankChangeInputSchema,
    output: DemoTransactionResultSchema,
    meta: { auth: "user" },
  })
  changeBankMovement(
    @Ctx() ctx: ApiRequestContext,
    @Input() input: { action: "correct" | "remove" },
  ) {
    return this.tools.changeBankMovement(rpcUser(ctx), input.action);
  }
}
