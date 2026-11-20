import {
  DemoDataResetInputSchema,
  DemoDataResetResultSchema,
  DemoTransactionInputSchema,
  DemoTransactionResultSchema,
} from "@lazyfinance/contracts";
import { Ctx, Mutation, Router } from "nestjs-trpc";
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
}
