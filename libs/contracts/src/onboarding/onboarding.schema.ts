import { z } from "zod";

export const OnboardingStateSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("active"), completedAt: z.null() }),
  z.strictObject({ status: z.literal("skipped"), completedAt: z.null() }),
  z.strictObject({
    status: z.literal("completed"),
    completedAt: z.iso.datetime(),
  }),
]);

// Completing the optional guide is terminal; there is deliberately no reset command.
export const FinishOnboardingSchema = z.strictObject({
  status: z.enum(["skipped", "completed"]),
});

export type OnboardingState = z.infer<typeof OnboardingStateSchema>;
export type FinishOnboarding = z.infer<typeof FinishOnboardingSchema>;
