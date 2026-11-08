import { z } from "zod";

export const SetInternalMovementSchema = z.strictObject({
  id: z.uuid(),
  isInternalMovement: z.boolean().nullable(),
});
export const InternalMovementDecisionSchema = z.object({
  id: z.uuid(),
  isInternalMovement: z.boolean().nullable(),
  userInternalOverride: z.boolean().nullable(),
  providerInternalAssessment: z.enum(["internal", "external", "unknown"]),
  reviewStatus: z.enum(["clear", "needs_review"]),
});
export type SetInternalMovement = z.infer<typeof SetInternalMovementSchema>;
