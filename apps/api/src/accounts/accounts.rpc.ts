import { AccountsResultSchema, RpcEmptySchema } from "@lazyfinance/contracts";
import { Inject } from "@nestjs/common";
import { Ctx, Query, Router } from "nestjs-trpc";
import type { ApiRequestContext } from "../rpc/api.context";
import { rpcUser } from "../rpc/api.middleware";
import { AccountsService } from "./accounts.service";

@Router({ alias: "accounts" })
export class AccountsRpc {
  constructor(
    @Inject(AccountsService) private readonly service: AccountsService,
  ) {}

  @Query({
    input: RpcEmptySchema,
    output: AccountsResultSchema,
    meta: { auth: "user" },
  })
  list(@Ctx() ctx: ApiRequestContext) {
    return this.service.getActiveForUser(rpcUser(ctx));
  }
}
