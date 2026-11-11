import { z } from "zod";
import { BankingModeSchema } from "../banking";
import {
  BankingAccountChoicesSchema,
  BankingAutomationSchema,
  BankingSelectionSchema,
} from "../banking-selection";

export const SaveProviderDiscoverySchema = z.strictObject({
  connectionId: z.uuid(),
  expectedCredentialVersion: z.number().int().nonnegative(),
  accounts: BankingAccountChoicesSchema,
});

export const DeferProviderDiscoverySchema = z.strictObject({
  connectionId: z.uuid(),
  expectedCredentialVersion: z.number().int().nonnegative(),
  retryAfter: z.iso.datetime(),
});

export const DeferProviderRequestsSchema = z.strictObject({
  mode: BankingModeSchema,
  retryAfter: z.iso.datetime(),
});

export const ProviderRequestReleasedSchema = z.object({
  released: z.boolean(),
});

export const ProviderTrackingSchema = z.object({
  selection: BankingSelectionSchema,
  automation: BankingAutomationSchema,
});

export const ProviderScheduleClaimSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  connectionId: z.uuid(),
  mode: BankingModeSchema,
  credentialVersion: z.number().int().nonnegative(),
  selectionVersion: z.number().int().nonnegative(),
  expiresAt: z.iso.datetime(),
});

export const ClaimProviderScheduleSchema = z.strictObject({
  mode: BankingModeSchema,
});

export const ProviderScheduleCompletionSchema = z.strictObject({
  nextAttemptAt: z.iso.datetime().nullable(),
  expectedFailureCount: z.number().int().nonnegative(),
});

export const AcquireProviderRequestSchema = z.strictObject({
  id: z.uuid(),
  mode: BankingModeSchema,
  purpose: z.enum(["sync", "lifecycle"]),
});

export const ProviderRequestPermitSchema = z.discriminatedUnion("acquired", [
  z.object({ acquired: z.literal(true), expiresAt: z.iso.datetime() }),
  z.object({ acquired: z.literal(false), retryAt: z.iso.datetime() }),
]);

export type SaveProviderDiscovery = z.infer<typeof SaveProviderDiscoverySchema>;
export type DeferProviderDiscovery = z.infer<
  typeof DeferProviderDiscoverySchema
>;
export type ProviderTracking = z.infer<typeof ProviderTrackingSchema>;
export type ProviderScheduleClaim = z.infer<typeof ProviderScheduleClaimSchema>;
export type ProviderScheduleCompletion = z.infer<
  typeof ProviderScheduleCompletionSchema
>;
export type AcquireProviderRequest = z.infer<
  typeof AcquireProviderRequestSchema
>;
