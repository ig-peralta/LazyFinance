import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module";
import { OnboardingRepository } from "./onboarding.repository";
import { OnboardingRpc } from "./onboarding.rpc";

@Module({
  imports: [DatabaseModule],
  providers: [OnboardingRepository, OnboardingRpc],
})
export class OnboardingModule {}
