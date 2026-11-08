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

export const BankingImportReportSchema = z.object({
  requestedHistory: z
    .object({ from: z.iso.date(), through: z.iso.date() })
    .refine((value) => value.from <= value.through),
  importedAccounts: z.number().int().nonnegative().max(1000),
  bookedMovements: z.number().int().nonnegative(),
  reversedMovements: z.number().int().nonnegative(),
  ignoredPendingMovements: z.number().int().nonnegative(),
  ignoredProcessingMovements: z.number().int().nonnegative(),
  // Provider descriptions and transfer hints do not prove external spending.
  uncertainMovements: z.number().int().nonnegative(),
  skippedAccounts: z
    .array(
      z.object({
        externalId: z.string().min(1).max(512),
        reason: z.enum([
          "unsupported_currency",
          "unsupported_type",
          "removed_from_link",
        ]),
      }),
    )
    .max(1000),
  unknownCardBalances: z.array(z.string().min(1).max(512)).max(1000),
});

export const BankingImportResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("superseded") }),
  z.object({
    status: z.literal("failed"),
    reason: z.enum(["retryable", "expired", "revoked", "invalid_data"]),
    retryAfter: z.iso.datetime().nullable(),
  }),
  z.object({
    status: z.enum(["complete", "needs_review"]),
    conflictCount: z.number().int().nonnegative(),
    report: BankingImportReportSchema,
  }),
]);

export type BankingConnection = z.infer<typeof BankingConnectionSchema>;
export type CreateBankingIntent = z.infer<typeof CreateBankingIntentSchema>;
export type CompleteBankingIntent = z.infer<typeof CompleteBankingIntentSchema>;
export type BankingImportReport = z.infer<typeof BankingImportReportSchema>;
export type BankingImportResult = z.infer<typeof BankingImportResultSchema>;
