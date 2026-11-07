import {
  BudgetProgressResultSchema,
  ObjectivesResultSchema,
  RpcEmptySchema,
  RpcMonthSchema,
} from "@lazyfinance/contracts";
import { Ctx, Input, Query, Router } from "nestjs-trpc";
import { type ApiRequestContext, rpcUser } from "../rpc/context";
import { checkedMonth } from "../utils/month-query";
import { santiagoMonth } from "../utils/santiago-time";
import { ObjectivesService } from "./objectives.service";

@Router({ alias: "objectives" })
export class ObjectivesRpc {
  constructor(private readonly service: ObjectivesService) {}

  @Query({
    input: RpcEmptySchema,
    output: ObjectivesResultSchema,
    meta: { auth: "user" },
  })
  list(@Ctx() ctx: ApiRequestContext) {
    return this.service.getForUser(rpcUser(ctx));
  }

  @Query({
    input: RpcMonthSchema,
    output: BudgetProgressResultSchema,
    meta: { auth: "user" },
  })
  progress(@Ctx() ctx: ApiRequestContext, @Input() input: { month?: string }) {
    return this.service.getSpendingProgressForUser(
      rpcUser(ctx),
      checkedMonth(input.month ?? santiagoMonth(new Date())),
    );
  }
}
