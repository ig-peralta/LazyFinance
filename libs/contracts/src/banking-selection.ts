import { z } from "zod";

const accountId = z
  .string()
  .regex(/^[A-Za-z0-9_-]+$/)
  .max(512);

export const BankingAccountChoiceSchema = z.strictObject({
  externalId: accountId,
  name: z.string().min(1).max(120),
  currency: z.string().min(1).max(10),
  numberSuffix: z.string().max(4).nullable(),
  unavailableReason: z
    .enum(["unsupported_currency", "unsupported_type", "removed_from_link"])
    .nullable(),
});

export const BankingSelectedIdsSchema = z
  .array(accountId)
  .max(1000)
  .refine((ids) => new Set(ids).size === ids.length, "Duplicate accounts");

export const BankingAccountChoicesSchema = z
  .array(BankingAccountChoiceSchema)
  .max(1000)
  .refine(
    (accounts) =>
      new Set(accounts.map((row) => row.externalId)).size === accounts.length,
    "Duplicate accounts",
  );

export const BankingSelectionSchema = z.object({
  connectionId: z.uuid(),
  version: z.number().int().nonnegative(),
  discoveryVersion: z.number().int().nonnegative(),
  discoveredAt: z.iso.datetime().nullable(),
  readRetryAfter: z.iso.datetime().nullable(),
  accounts: BankingAccountChoicesSchema,
  accountIds: BankingSelectedIdsSchema,
  confirmedAt: z.iso.datetime().nullable(),
  automaticEnrolled: z.boolean(),
});

export const SelectBankingAccountsSchema = z.strictObject({
  id: z.uuid(),
  expectedVersion: z.number().int().nonnegative(),
  discoveryVersion: z.number().int().positive(),
  accountIds: BankingSelectedIdsSchema,
  automaticEnrolled: z.boolean(),
});

export const BankingAutomationSchema = z.object({
  enrolled: z.boolean(),
  selectedAccounts: z.number().int().nonnegative().max(1000),
  nextAttemptAt: z.iso.datetime().nullable(),
  failureCount: z.number().int().nonnegative(),
  pauseReason: z
    .enum([
      "selection_required",
      "no_accounts",
      "access",
      "invalid_data",
      "account_unavailable",
      "repeated_failure",
    ])
    .nullable(),
});

export type BankingAccountChoice = z.infer<typeof BankingAccountChoiceSchema>;
export type BankingSelection = z.infer<typeof BankingSelectionSchema>;
export type SelectBankingAccounts = z.infer<typeof SelectBankingAccountsSchema>;
export type BankingAutomation = z.infer<typeof BankingAutomationSchema>;
