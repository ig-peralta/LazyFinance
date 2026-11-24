import {
  DemoBankChangeInputSchema,
  DemoBankFailureInputSchema,
  DemoBankFailureResultSchema,
  DemoBankHistorySchema,
  DemoBankPreparationSchema,
  DemoBankReconnectSchema,
  DemoDataResetInputSchema,
  DemoDataResetResultSchema,
  DemoTransactionInputSchema,
  DemoTransactionResultSchema,
  RpcIdSchema,
} from "@lazyfinance/contracts";
import { DemoBankSourceSchema } from "@lazyfinance/contracts/internal";
import { Ctx, Input, Mutation, Query, Router } from "nestjs-trpc";
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

  @Mutation({
    input: DemoBankChangeInputSchema,
    output: DemoTransactionResultSchema,
    meta: { context: "user" },
  })
  changeBankMovement(
    @Ctx() ctx: PersistenceRequestContext,
    @Input() input: { action: "correct" | "remove" },
  ) {
    if (ctx.identity.kind !== "user") throw new Error("User context required");
    return this.tools.changeMovement(ctx.identity.userId, input.action);
  }

  @Query({
    input: DemoTransactionInputSchema,
    output: DemoBankPreparationSchema,
    meta: { context: "user" },
  })
  preparation(@Ctx() ctx: PersistenceRequestContext) {
    if (ctx.identity.kind !== "user") throw new Error("User context required");
    return this.tools.preparation(ctx.identity.userId);
  }

  @Mutation({
    input: DemoTransactionInputSchema,
    output: DemoDataResetResultSchema,
    meta: { context: "user" },
  })
  finalizeDemoData(@Ctx() ctx: PersistenceRequestContext) {
    if (ctx.identity.kind !== "user") throw new Error("User context required");
    return this.tools.finalize(ctx.identity.userId);
  }

  @Query({
    input: RpcIdSchema,
    output: DemoBankSourceSchema,
    meta: { context: "user" },
  })
  bankSource(
    @Ctx() ctx: PersistenceRequestContext,
    @Input() input: { id: string },
  ) {
    if (ctx.identity.kind !== "user") throw new Error("User context required");
    return this.tools.source(ctx.identity.userId, input.id);
  }

  @Query({
    input: RpcIdSchema,
    output: DemoBankHistorySchema,
    meta: { context: "user" },
  })
  bankHistory(
    @Ctx() ctx: PersistenceRequestContext,
    @Input() input: { id: string },
  ) {
    if (ctx.identity.kind !== "user") throw new Error("User context required");
    return this.tools.history(ctx.identity.userId, input.id);
  }

  @Mutation({
    input: DemoBankFailureInputSchema,
    output: DemoBankFailureResultSchema,
    meta: { context: "user" },
  })
  setBankFailure(
    @Ctx() ctx: PersistenceRequestContext,
    @Input() input: { failure: "retryable" | "expired" | null },
  ) {
    if (ctx.identity.kind !== "user") throw new Error("User context required");
    return this.tools.setFailure(ctx.identity.userId, input.failure);
  }

  @Mutation({
    input: RpcIdSchema,
    output: DemoBankReconnectSchema,
    meta: { context: "user" },
  })
  reconnectBank(
    @Ctx() ctx: PersistenceRequestContext,
    @Input() input: { id: string },
  ) {
    if (ctx.identity.kind !== "user") throw new Error("User context required");
    return this.tools.reconnect(ctx.identity.userId, input.id);
  }
}
