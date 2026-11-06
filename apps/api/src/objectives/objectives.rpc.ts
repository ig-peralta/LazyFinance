import {
  BudgetProgressResultSchema,
  ObjectivesResultSchema,
  RpcEmptySchema,
  RpcMonthSchema,
} from "@lazyfinance/contracts";
import { Inject } from "@nestjs/common";
import { Ctx, Input, Query, Router } from "nestjs-trpc";
import { checkedMonth } from "../_utils/month-query";
import { santiagoMonth } from "../_utils/santiago-time";
import type { ApiRequestContext } from "../rpc/api.context";
import { rpcUser } from "../rpc/api.middleware";
import { ObjectivesService } from "./objectives.service";

@Router({ alias: "objectives" })
export class ObjectivesRpc {
  constructor(
    @Inject(ObjectivesService) private readonly service: ObjectivesService,
  ) {}
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
