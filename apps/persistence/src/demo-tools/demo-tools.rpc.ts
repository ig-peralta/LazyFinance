import { DemoDataResetResultSchema } from "@lazyfinance/contracts";
import { EmptyInputSchema } from "@lazyfinance/contracts/internal";
import { Ctx, Mutation, Router } from "nestjs-trpc";
import type { PersistenceRequestContext } from "../rpc/persistence.context";
import { DemoToolsService } from "./demo-tools.service";

@Router({ alias: "demoTools" })
export class DemoToolsRpc {
  constructor(private readonly tools: DemoToolsService) {}

  @Mutation({
    input: EmptyInputSchema,
    output: DemoDataResetResultSchema,
    meta: { context: "user" },
  })
  resetDemoData(@Ctx() ctx: PersistenceRequestContext) {
    if (ctx.identity.kind !== "user") throw new Error("User context required");
    return this.tools.resetDemoData(ctx.identity.userId);
  }
}
