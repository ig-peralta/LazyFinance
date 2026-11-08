import {
  MonthlyComparisonSchema,
  MonthlySummarySchema,
  RpcMonthSchema,
  type SpendingContributionsInput,
  SpendingContributionsInputSchema,
  SpendingContributionsPageSchema,
} from "@lazyfinance/contracts";
import { Ctx, Input, Query, Router } from "nestjs-trpc";
import { SpendingEvidenceService } from "../finance/spending-evidence.service";
import { type ApiRequestContext, rpcUser } from "../rpc/context";
import { checkedMonth } from "../utils/month-query";
import { santiagoMonth } from "../utils/santiago-time";
import { SummariesService } from "./summaries.service";

@Router({ alias: "summaries" })
export class SummariesRpc {
  constructor(
    private readonly service: SummariesService,
    private readonly evidence: SpendingEvidenceService,
  ) {}

  @Query({
    input: SpendingContributionsInputSchema,
    output: SpendingContributionsPageSchema,
    meta: { auth: "user" },
  })
  spendingContributions(
    @Ctx() ctx: ApiRequestContext,
    @Input() input: SpendingContributionsInput,
  ) {
    return this.evidence.summary(rpcUser(ctx), input);
  }

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
