import {
  MonthlyComparisonSchema,
  MonthlySummarySchema,
  RpcMonthSchema,
} from "@lazyfinance/contracts";
import { Inject } from "@nestjs/common";
import { Ctx, Input, Query, Router } from "nestjs-trpc";
import { checkedMonth } from "../_utils/month-query";
import { santiagoMonth } from "../_utils/santiago-time";
import type { ApiRequestContext } from "../rpc/api.context";
import { rpcUser } from "../rpc/api.middleware";
import { SummariesService } from "./summaries.service";

@Router({ alias: "summaries" })
export class SummariesRpc {
  constructor(
    @Inject(SummariesService) private readonly service: SummariesService,
  ) {}
  @Query({
    input: RpcMonthSchema,
    output: MonthlySummarySchema,
    meta: { auth: "user" },
  })
  monthly(@Ctx() ctx: ApiRequestContext, @Input() input: { month?: string }) {
    return this.service.getMonthlyForUser(
      rpcUser(ctx),
      checkedMonth(input.month ?? santiagoMonth(new Date())),
    );
  }
  @Query({
    input: RpcMonthSchema,
    output: MonthlyComparisonSchema,
    meta: { auth: "user" },
  })
  comparison(
    @Ctx() ctx: ApiRequestContext,
    @Input() input: { month?: string },
  ) {
    return this.service.getComparisonForUser(
      rpcUser(ctx),
      checkedMonth(input.month ?? santiagoMonth(new Date())),
    );
  }
}
