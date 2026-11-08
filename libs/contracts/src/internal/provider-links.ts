import { z } from "zod";
import {
  BankingConnectionSchema,
  BankingHolderSchema,
  BankingModeSchema,
  BankingStatusSchema,
} from "../banking";

const providerId = z
  .string()
  .regex(/^[A-Za-z0-9_-]+$/)
  .max(100);
const version = z.number().int().nonnegative();
const hash = z.string().regex(/^[a-f0-9]{64}$/);

export const ProviderLinkSecretSchema = z.object({
  connection: BankingConnectionSchema,
  externalId: providerId,
  encryptedCredential: z.string().max(2048).nullable(),
  version,
});

export const SaveProviderIntentSchema = z.strictObject({
  id: z.uuid(),
  providerIntentId: providerId,
  holderType: BankingHolderSchema,
  mode: BankingModeSchema,
  connectionId: z.uuid().nullable(),
  expectedVersion: version.nullable(),
});

export const ClaimProviderIntentSchema = z.strictObject({
  id: z.uuid(),
  providerIntentId: providerId,
  exchangeTokenHash: hash,
});

export const ProviderIntentClaimSchema = z.discriminatedUnion("state", [
  z.object({
    state: z.literal("completed"),
    connection: BankingConnectionSchema,
  }),
  z.object({
    state: z.literal("claimed"),
    mode: BankingModeSchema,
    holderType: BankingHolderSchema,
  }),
]);

export const CompleteProviderIntentSchema = z.strictObject({
  id: z.uuid(),
  exchangeTokenHash: hash,
  externalId: providerId,
  encryptedCredential: z.string().min(1).max(2048),
  institution: z.object({ id: providerId, name: z.string().min(1).max(200) }),
  status: BankingStatusSchema,
});

export const FailProviderIntentSchema = z.strictObject({
  id: z.uuid(),
  exchangeTokenHash: hash,
});

export const ProviderIntentStateSchema = z.object({
  state: z.enum(["pending", "processing", "completed", "failed"]),
});

export const UpdateProviderLinkSchema = z.strictObject({
  id: z.uuid(),
  expectedVersion: version,
  status: BankingStatusSchema,
});

export const FinishProviderDisconnectSchema = z.strictObject({
  id: z.uuid(),
  expectedVersion: version,
});

export const ProviderIntentSavedSchema = z.object({
  expiresAt: z.iso.datetime(),
});

export type SaveProviderIntent = z.infer<typeof SaveProviderIntentSchema>;
export type ClaimProviderIntent = z.infer<typeof ClaimProviderIntentSchema>;
export type CompleteProviderIntent = z.infer<
  typeof CompleteProviderIntentSchema
>;
export type ProviderLinkSecret = z.infer<typeof ProviderLinkSecretSchema>;
export type UpdateProviderLink = z.infer<typeof UpdateProviderLinkSchema>;
