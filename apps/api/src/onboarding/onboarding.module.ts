import { Module } from "@nestjs/common";
import { PersistenceModule } from "../persistence/persistence.module";
import { OnboardingRpc } from "./onboarding.rpc";
import { OnboardingService } from "./onboarding.service";

@Module({
  imports: [PersistenceModule],
  providers: [OnboardingService, OnboardingRpc],
})
export class OnboardingModule {}
