import type { FinishOnboarding, OnboardingState } from "@lazyfinance/contracts";
import { Injectable } from "@nestjs/common";
import { PersistenceClient } from "../persistence/persistence.client";

@Injectable()
export class OnboardingService {
  constructor(private readonly persistence: PersistenceClient) {}

  state(userId: string): Promise<OnboardingState> {
    return this.persistence.user(userId).onboarding.state.query();
  }

  finish(userId: string, input: FinishOnboarding): Promise<OnboardingState> {
    return this.persistence.user(userId).onboarding.finish.mutate(input);
  }
}
