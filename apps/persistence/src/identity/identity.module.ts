import { Module } from "@nestjs/common";
import { ExternalIdentityModule } from "./external-identity/external-identity.module";
import { OnboardingModule } from "./onboarding/onboarding.module";

@Module({ imports: [ExternalIdentityModule, OnboardingModule] })
export class IdentityModule {}
