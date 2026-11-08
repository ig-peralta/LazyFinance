export interface OnboardingTable {
  userId: string;
  status: "skipped" | "completed";
  completedAt: Date | null;
}

export type OnboardingTables = { "identity.onboarding": OnboardingTable };
