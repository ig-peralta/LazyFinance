import {
  DemoDataResetInputSchema,
  DemoDataResetResultSchema,
  DemoTransactionInputSchema,
  DemoTransactionResultSchema,
} from "@lazyfinance/contracts";
import { Ctx, Mutation, Router } from "nestjs-trpc";
import type { PersistenceRequestContext } from "../rpc/persistence.context";
import { DemoToolsService } from "./demo-tools.service";

@Router({ alias: "demoTools" })
export class DemoToolsRpc {
  constructor(private readonly tools: DemoToolsService) {}

  @Mutation({
    input: DemoDataResetInputSchema,
    output: DemoDataResetResultSchema,
    meta: { context: "user" },
  })
  resetDemoData(@Ctx() ctx: PersistenceRequestContext) {
    if (ctx.identity.kind !== "user") throw new Error("User context required");
    return this.tools.resetDemoData(ctx.identity.userId);
  }

  @Mutation({
    input: DemoTransactionInputSchema,
    output: DemoTransactionResultSchema,
    meta: { context: "user" },
  })
  createInternalTransaction(@Ctx() ctx: PersistenceRequestContext) {
    if (ctx.identity.kind !== "user") throw new Error("User context required");
    return this.tools.createTransaction(ctx.identity.userId, "internal");
  }

  @Mutation({
    input: DemoTransactionInputSchema,
    output: DemoTransactionResultSchema,
    meta: { context: "user" },
  })
  createExternalTransaction(@Ctx() ctx: PersistenceRequestContext) {
    if (ctx.identity.kind !== "user") throw new Error("User context required");
    return this.tools.createTransaction(ctx.identity.userId, "external");
  }
}
