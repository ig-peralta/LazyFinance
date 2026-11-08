import { z } from "zod";

export const BankingModeSchema = z.enum(["test", "live"]);
export const BankingHolderSchema = z.enum(["individual", "business"]);
export const BankingStatusSchema = z.enum(["active", "expired", "revoked"]);

export const BankingConnectionSchema = z.object({
  id: z.uuid(),
  provider: z.literal("fintoc"),
  mode: BankingModeSchema,
  holderType: BankingHolderSchema,
  institution: z.object({
    id: z.string().min(1).max(100),
    name: z.string().min(1).max(200),
  }),
  status: BankingStatusSchema,
  disconnectedAt: z.iso.datetime().nullable(),
  disconnectPending: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const BankingConnectionsSchema = z
  .array(BankingConnectionSchema)
  .max(100);

export const BankingConfigurationSchema = z.discriminatedUnion("enabled", [
  z.object({ enabled: z.literal(false) }),
  z.object({
    enabled: z.literal(true),
    publicKey: z.string(),
    mode: BankingModeSchema,
  }),
]);

export const CreateBankingIntentSchema = z.strictObject({
  holderType: BankingHolderSchema,
  connectionId: z.uuid().optional(),
});

export const BankingIntentSchema = z.object({
  id: z.uuid(),
  publicKey: z.string(),
  widgetToken: z.string().min(1).max(512),
  mode: BankingModeSchema,
  expiresAt: z.iso.datetime(),
});

export const CompleteBankingIntentSchema = z.strictObject({
  id: z.uuid(),
  exchangeToken: z.string().min(1).max(512),
});

export type BankingConnection = z.infer<typeof BankingConnectionSchema>;
export type CreateBankingIntent = z.infer<typeof CreateBankingIntentSchema>;
export type CompleteBankingIntent = z.infer<typeof CompleteBankingIntentSchema>;
