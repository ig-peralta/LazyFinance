import {
  DemoDataResetInputSchema,
  DemoDataResetResultSchema,
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
}
