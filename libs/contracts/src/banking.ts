import { z } from "zod";
import { BankingAutomationSchema } from "./banking-selection";

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
    automaticSyncEnabled: z.boolean(),
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
  // Inclusive booking days from the connection's first link through this pull.
  // This is neither a pre-link backfill nor a claim of exact transaction times.
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

export const BankingSyncIncompleteSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("superseded") }),
  z.object({ status: z.literal("in_progress"), until: z.iso.datetime() }),
  z.object({ status: z.literal("retry_later"), retryAfter: z.iso.datetime() }),
  z.object({
    status: z.literal("failed"),
    reason: z.enum([
      "retryable",
      "expired",
      "revoked",
      "invalid_data",
      "account_unavailable",
    ]),
    retryAfter: z.iso.datetime().nullable(),
  }),
]);

export const BankingImportResultSchema = z.discriminatedUnion("status", [
  BankingSyncIncompleteSchema,
  z.object({
    status: z.enum(["complete", "needs_review"]),
    conflictCount: z.number().int().nonnegative(),
    report: BankingImportReportSchema,
  }),
]);

const freshness = z.enum(["fresh", "stale", "unknown"]);

export const BankingSyncStatusSchema = z.object({
  connectionId: z.uuid(),
  automation: BankingAutomationSchema,
  asOf: z.iso.datetime(),
  lifecycle: BankingStatusSchema,
  disconnectedAt: z.iso.datetime().nullable(),
  disconnectPending: z.boolean(),
  activity: z.enum(["idle", "in_progress", "interrupted"]),
  leaseExpiresAt: z.iso.datetime().nullable(),
  lastAttemptAt: z.iso.datetime().nullable(),
  lastSuccessAt: z.iso.datetime().nullable(),
  lastResult: z.enum(["complete", "needs_review"]).nullable(),
  unresolvedConflictCount: z.number().int().nonnegative(),
  providerSuspensionCount: z.number().int().nonnegative(),
  failure: z
    .object({
      at: z.iso.datetime(),
      reason: z.enum([
        "retryable",
        "expired",
        "revoked",
        "invalid_data",
        "account_unavailable",
      ]),
      retryAfter: z.iso.datetime().nullable(),
    })
    .nullable(),
  canRefresh: z.boolean(),
  freshness: z.object({
    state: freshness,
    staleAfterSeconds: z.number().int().positive(),
    freshAccounts: z.number().int().nonnegative(),
    staleAccounts: z.number().int().nonnegative(),
    unknownAccounts: z.number().int().nonnegative(),
  }),
  accounts: z
    .array(
      z.object({
        id: z.uuid(),
        type: z.enum(["checking", "savings", "credit_card"]),
        freshness,
        balanceAsOf: z.iso.datetime().nullable(),
        historyCoverage: z.object({
          completeness: z.enum(["complete", "partial", "unknown"]),
          from: z.iso.date().nullable(),
          through: z.iso.date().nullable(),
        }),
      }),
    )
    .max(1000),
});

export type BankingConnection = z.infer<typeof BankingConnectionSchema>;
export type CreateBankingIntent = z.infer<typeof CreateBankingIntentSchema>;
export type CompleteBankingIntent = z.infer<typeof CompleteBankingIntentSchema>;
export type BankingImportReport = z.infer<typeof BankingImportReportSchema>;
export type BankingImportResult = z.infer<typeof BankingImportResultSchema>;
export type BankingSyncStatus = z.infer<typeof BankingSyncStatusSchema>;
