import {
  FinancialActionIdSchema,
  FinancialActionSchema,
  FinancialActionVersionSchema,
  ReviseFinancialActionSchema,
} from "@lazyfinance/contracts";
import { Ctx, Input, Mutation, Query, Router } from "nestjs-trpc";
import type { z } from "zod";
import { type ApiRequestContext, rpcUser } from "../rpc/context";
import { ActionsService } from "./actions.service";

@Router({ alias: "financialActions" })
export class ActionsRpc {
  constructor(private readonly actions: ActionsService) {}

  @Query({
    input: FinancialActionIdSchema,
    output: FinancialActionSchema,
    meta: { auth: "user" },
  })
  get(
    @Input() input: z.infer<typeof FinancialActionIdSchema>,
    @Ctx() ctx: ApiRequestContext,
  ) {
    return this.actions.get(rpcUser(ctx), input.id);
  }

  @Mutation({
    input: FinancialActionVersionSchema,
    output: FinancialActionSchema,
    meta: { auth: "user" },
  })
  approve(
    @Input() input: z.infer<typeof FinancialActionVersionSchema>,
    @Ctx() ctx: ApiRequestContext,
  ) {
    return this.actions.approve(rpcUser(ctx), input);
  }

  @Mutation({
    input: FinancialActionVersionSchema,
    output: FinancialActionSchema,
    meta: { auth: "user" },
  })
  cancel(
    @Input() input: z.infer<typeof FinancialActionVersionSchema>,
    @Ctx() ctx: ApiRequestContext,
  ) {
    return this.actions.cancel(rpcUser(ctx), input);
  }

  @Mutation({
    input: ReviseFinancialActionSchema,
    output: FinancialActionSchema,
    meta: { auth: "user" },
  })
  revise(
    @Input() input: z.infer<typeof ReviseFinancialActionSchema>,
    @Ctx() ctx: ApiRequestContext,
  ) {
    return this.actions.revise(rpcUser(ctx), input);
  }
}
