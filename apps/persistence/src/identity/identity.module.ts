import { Module } from "@nestjs/common";
import { ExternalIdentityModule } from "./external-identity/external-identity.module";
import { McpAuthorizationModule } from "./mcp-authorization/mcp-authorization.module";
import { OnboardingModule } from "./onboarding/onboarding.module";

@Module({
  imports: [ExternalIdentityModule, OnboardingModule, McpAuthorizationModule],
})
export class IdentityModule {}
