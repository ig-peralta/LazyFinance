import {
  RecentTransactionsResultSchema,
  RpcEmptySchema,
  type TransactionsInput,
  TransactionsInputSchema,
  TransactionsPageSchema,
} from "@lazyfinance/contracts";
import { Ctx, Input, Query, Router } from "nestjs-trpc";
import { type ApiRequestContext, rpcUser } from "../rpc/context";
import { TransactionsService } from "./transactions.service";

@Router({ alias: "transactions" })
export class TransactionsRpc {
  constructor(private readonly service: TransactionsService) {}

  @Query({
    input: RpcEmptySchema,
    output: RecentTransactionsResultSchema,
    meta: { auth: "user" },
  })
  recent(@Ctx() ctx: ApiRequestContext) {
    return this.service.getRecentForUser(rpcUser(ctx));
  }

  @Query({
    input: TransactionsInputSchema,
    output: TransactionsPageSchema,
    meta: { auth: "user" },
  })
  list(@Ctx() ctx: ApiRequestContext, @Input() input: TransactionsInput) {
    return this.service.listForUser(rpcUser(ctx), input);
  }
}
