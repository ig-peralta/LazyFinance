import {
  FinancialActionIdSchema,
  FinancialActionPreviewSchema,
  FinancialActionSchema,
  FinancialActionVersionSchema,
} from "@lazyfinance/contracts";
import {
  ApplyFinancialActionSchema,
  ExecuteFinancialActionSchema,
  PrepareFinancialActionSchema,
  PreviewFinancialActionSchema,
  ReviseFinancialActionCommandSchema,
} from "@lazyfinance/contracts/internal";
import { Input, Mutation, Query, Router } from "nestjs-trpc";
import type { z } from "zod";
import { ActionRepository } from "./action.repository";

@Router({ alias: "financialActions" })
export class FinancialActionsRpc {
  constructor(private readonly actions: ActionRepository) {}

  @Query({
    input: FinancialActionIdSchema,
    output: FinancialActionSchema,
    meta: { context: "user" },
  })
  get(@Input() input: z.infer<typeof FinancialActionIdSchema>) {
    return this.actions.get(input.id);
  }

  @Query({
    input: PreviewFinancialActionSchema,
    output: FinancialActionPreviewSchema,
    meta: { context: "user", snapshot: true },
  })
  preview(@Input() input: z.infer<typeof PreviewFinancialActionSchema>) {
    return this.actions.preview(input.action);
  }

  @Mutation({
    input: PrepareFinancialActionSchema,
    output: FinancialActionSchema,
    meta: { context: "user" },
  })
  prepare(@Input() input: z.infer<typeof PrepareFinancialActionSchema>) {
    return this.actions.prepare(input);
  }

  @Mutation({
    input: ReviseFinancialActionCommandSchema,
    output: FinancialActionSchema,
    meta: { context: "user" },
  })
  revise(@Input() input: z.infer<typeof ReviseFinancialActionCommandSchema>) {
    return this.actions.revise(input);
  }

  @Mutation({
    input: ApplyFinancialActionSchema,
    output: FinancialActionSchema,
    meta: { context: "user" },
  })
  apply(@Input() input: z.infer<typeof ApplyFinancialActionSchema>) {
    return this.actions.apply(input);
  }

  @Mutation({
    input: FinancialActionVersionSchema,
    output: FinancialActionSchema,
    meta: { context: "user" },
  })
  cancel(@Input() input: z.infer<typeof FinancialActionVersionSchema>) {
    return this.actions.cancel(input);
  }

  @Mutation({
    input: ExecuteFinancialActionSchema,
    output: FinancialActionSchema,
    meta: { context: "user" },
  })
  execute(@Input() input: z.infer<typeof ExecuteFinancialActionSchema>) {
    return this.actions.executeDirect(input);
  }
}
