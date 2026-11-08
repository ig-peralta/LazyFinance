import type { ExternalIdentityTables } from "./external-identity/external-identity.tables";
import type { OnboardingTables } from "./onboarding/onboarding.tables";
import type { UserTables } from "./user/user.tables";

export type IdentityTables = UserTables &
  ExternalIdentityTables &
  OnboardingTables;
