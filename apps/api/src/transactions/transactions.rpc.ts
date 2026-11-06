import {
  RecentTransactionsResultSchema,
  RpcEmptySchema,
} from "@lazyfinance/contracts";
import { Inject } from "@nestjs/common";
import { Ctx, Query, Router } from "nestjs-trpc";
import type { ApiRequestContext } from "../rpc/api.context";
import { rpcUser } from "../rpc/api.middleware";
import { TransactionsService } from "./transactions.service";

@Router({ alias: "transactions" })
export class TransactionsRpc {
  constructor(
    @Inject(TransactionsService) private readonly service: TransactionsService,
  ) {}
  @Query({
    input: RpcEmptySchema,
    output: RecentTransactionsResultSchema,
    meta: { auth: "user" },
  })
  recent(@Ctx() ctx: ApiRequestContext) {
    return this.service.getRecentForUser(rpcUser(ctx));
  }
}
