import { AccountsResultSchema, RpcEmptySchema } from "@lazyfinance/contracts";
import { Ctx, Query, Router } from "nestjs-trpc";
import { type ApiRequestContext, rpcUser } from "../rpc/context";
import { AccountsService } from "./accounts.service";

@Router({ alias: "accounts" })
export class AccountsRpc {
  constructor(private readonly service: AccountsService) {}

  @Query({
    input: RpcEmptySchema,
    output: AccountsResultSchema,
    meta: { auth: "user" },
  })
  list(@Ctx() ctx: ApiRequestContext) {
    return this.service.getActiveForUser(rpcUser(ctx));
  }
}
