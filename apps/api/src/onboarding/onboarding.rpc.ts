import {
  type FinishOnboarding,
  FinishOnboardingSchema,
  OnboardingStateSchema,
  RpcEmptySchema,
} from "@lazyfinance/contracts";
import { Ctx, Input, Mutation, Query, Router } from "nestjs-trpc";
import { type ApiRequestContext, rpcUser } from "../rpc/context";
import { OnboardingService } from "./onboarding.service";

@Router({ alias: "onboarding" })
export class OnboardingRpc {
  constructor(private readonly service: OnboardingService) {}

  @Query({
    input: RpcEmptySchema,
    output: OnboardingStateSchema,
    meta: { auth: "user" },
  })
  state(@Ctx() ctx: ApiRequestContext) {
    return this.service.state(rpcUser(ctx));
  }

  @Mutation({
    input: FinishOnboardingSchema,
    output: OnboardingStateSchema,
    meta: { auth: "user" },
  })
  finish(@Ctx() ctx: ApiRequestContext, @Input() input: FinishOnboarding) {
    return this.service.finish(rpcUser(ctx), input);
  }
}
