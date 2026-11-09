import type { ExternalIdentityTables } from "./external-identity/external-identity.tables";
import type { McpAuthorizationTables } from "./mcp-authorization/mcp-authorization.tables";
import type { OnboardingTables } from "./onboarding/onboarding.tables";
import type { UserTables } from "./user/user.tables";

export type IdentityTables = UserTables &
  ExternalIdentityTables &
  OnboardingTables &
  McpAuthorizationTables;
