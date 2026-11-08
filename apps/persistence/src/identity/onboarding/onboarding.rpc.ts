import {
  type FinishOnboarding,
  FinishOnboardingSchema,
  OnboardingStateSchema,
  RpcEmptySchema,
} from "@lazyfinance/contracts";
import { Input, Mutation, Query, Router } from "nestjs-trpc";
import { OnboardingRepository } from "./onboarding.repository";

@Router({ alias: "onboarding" })
export class OnboardingRpc {
  constructor(private readonly repository: OnboardingRepository) {}

  @Query({
    input: RpcEmptySchema,
    output: OnboardingStateSchema,
    meta: { context: "user" },
  })
  state() {
    return this.repository.state();
  }

  @Mutation({
    input: FinishOnboardingSchema,
    output: OnboardingStateSchema,
    meta: { context: "user" },
  })
  finish(@Input() input: FinishOnboarding) {
    return this.repository.finish(input);
  }
}
