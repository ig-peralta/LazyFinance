import { z } from "zod";
import {
  MatchingRuleSchema,
  PreparedTagDecisionSchema,
  TransactionRecordSchema,
} from "./tagging";

const externalId = z
  .string()
  .min(1)
  .max(512)
  .refine((value) => value.trim().length > 0);
const money = z
  .string()
  .regex(/^-?(0|[1-9]\d{0,12})\.\d{2}$/)
  .refine((value) => value !== "-0.00");
const instant = z.iso.datetime();
// Compound resource bounds: a run is atomic, never silently split into commits.
export const MAX_SYNC_RECORDS = 50000;
export const MAX_NORMALIZED_SYNC_BYTES = 32 * 1024 * 1024;
export const MAX_PERSISTENCE_RPC_BYTES = 64 * 1024 * 1024;
export const ProviderMovementKeySchema = z.strictObject({
  accountExternalId: externalId,
  externalId,
});
export const ProviderConflictReasonSchema = z.enum([
  "receipt_incompatible",
  "internal_override_disagrees",
  "removed_confirmed_income",
]);
export const ProviderAccountRecordSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  providerConnectionId: z.uuid(),
  externalId: externalId.nullable(),
  type: z.enum(["checking", "savings", "credit_card"]),
  number: z.string().nullable(),
  holderName: z.string().nullable(),
  holderRut: z.string().nullable(),
  alias: z.string().nullable(),
  currency: z.literal("CLP"),
  balance: money.nullable(),
  active: z.boolean(),
  lastSyncedAt: instant.nullable(),
  providerObservedAt: instant.nullable(),
  historyCompleteness: z.enum(["complete", "partial", "unknown"]),
  historyFrom: z.iso.date().nullable(),
  historyThrough: z.iso.date().nullable(),
  createdAt: instant,
  updatedAt: instant,
});
export const ProviderSyncStateSchema = z.object({
  providerConnectionId: z.uuid(),
  checkpoint: externalId.nullable(),
  revision: z.number().int().nonnegative(),
  lastAttemptAt: instant.nullable(),
  lastSuccessAt: instant.nullable(),
  lastProviderObservedAt: instant.nullable(),
  lastResult: z.enum(["complete", "needs_review"]).nullable(),
  unresolvedConflictCount: z.number().int().nonnegative(),
  lastFailureAt: instant.nullable(),
  lastFailureReason: z
    .enum(["retryable", "expired", "revoked", "invalid_data"])
    .nullable(),
  retryAfter: instant.nullable(),
});
export const BeginProviderSyncSchema = z.strictObject({
  connectionId: z.uuid(),
  provider: z.string().min(1).max(64),
});
export const ProviderSyncScopeSchema = z
  .strictObject({
    connectionId: z.uuid(),
    revision: z.number().int().nonnegative(),
    keys: z.array(ProviderMovementKeySchema).max(100000),
  })
  .refine(
    (value) =>
      new Set(
        value.keys.map((key) =>
          JSON.stringify([key.accountExternalId, key.externalId]),
        ),
      ).size === value.keys.length,
    "Duplicate movement keys",
  );
export const ProviderRemovalRecordSchema = z.object({
  providerConnectionId: z.uuid(),
  accountExternalId: externalId,
  movementExternalId: externalId,
  reason: z.enum(["removed", "reversed"]),
  observedAt: instant,
  providerUpdatedAt: instant.nullable(),
});
export const ProviderSyncFactsSchema = z.object({
  state: ProviderSyncStateSchema,
  accounts: z.array(ProviderAccountRecordSchema).max(50000),
  movements: z.array(TransactionRecordSchema).max(100000),
  removals: z.array(ProviderRemovalRecordSchema).max(100000),
  receiptTransactionIds: z.array(z.uuid()).max(100000),
  rules: z.array(MatchingRuleSchema).max(10000),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
});
export const PreparedProviderAccountSchema = z.strictObject({
  id: z.uuid(),
  externalId,
  type: z.enum(["checking", "savings", "credit_card"]),
  currency: z.literal("CLP"),
  number: z.string().max(64).nullable(),
  holderName: z.string().max(120).nullable(),
  providerObservedAt: instant,
  historyCompleteness: z.enum(["complete", "partial", "unknown"]),
  historyFrom: z.iso.date().nullable(),
  historyThrough: z.iso.date().nullable(),
  balance: money.nullable(),
  lastSyncedAt: instant.nullable(),
});
export const PreparedProviderMovementSchema = z
  .strictObject({
    id: z.uuid(),
    accountExternalId: externalId,
    externalId,
    amount: money.refine((value) => value !== "0.00"),
    type: z.enum(["debit", "credit"]),
    bookedAt: instant,
    bookedPrecision: z.enum(["instant", "calendar_day"]),
    bookedOn: z.iso.date().nullable(),
    description: z.string().max(240).nullable(),
    merchant: z.string().max(120).nullable(),
    providerUpdatedAt: instant.nullable(),
    providerObservedAt: instant,
    providerKind: z.enum([
      "transfer",
      "card_payment",
      "reversal",
      "other",
      "unknown",
    ]),
    relationKind: z
      .enum(["transfer_pair", "card_payment_pair", "reversal"])
      .nullable(),
    relatedAccountExternalId: externalId.nullable(),
    relatedMovementExternalId: externalId.nullable(),
    counterpartyHolder: z
      .strictObject({
        scheme: z.string().min(1).max(64),
        value: z.string().min(1).max(128),
      })
      .nullable(),
    providerInternalAssessment: z.enum(["internal", "external", "unknown"]),
    // Omitted means preserve the current decision; null IDs explicitly clear a rule decision.
    decision: PreparedTagDecisionSchema.omit({
      transactionId: true,
    }).optional(),
  })
  .refine(
    (value) => (value.type === "debit") === value.amount.startsWith("-"),
    "Direction disagrees with amount",
  );
export const PreparedProviderRemovalSchema = ProviderMovementKeySchema.extend({
  reason: z.enum(["removed", "reversed"]),
  observedAt: instant,
  providerUpdatedAt: instant.nullable(),
});
export const CommitProviderSyncSchema = z
  .strictObject({
    scope: ProviderSyncScopeSchema,
    expectedFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    observedAt: instant,
    checkpoint: externalId.nullable(),
    accounts: z.array(PreparedProviderAccountSchema).max(50000),
    movements: z.array(PreparedProviderMovementSchema).max(50000),
    removals: z.array(PreparedProviderRemovalSchema).max(50000),
  })
  .superRefine((value, ctx) => {
    if (
      value.accounts.length + value.movements.length + value.removals.length >
      50000
    )
      ctx.addIssue({ code: "custom", message: "Sync exceeds record limit" });
    for (const [name, keys] of [
      ["accounts", value.accounts.map((row) => row.externalId)],
      [
        "movements",
        value.movements.map((row) =>
          JSON.stringify([row.accountExternalId, row.externalId]),
        ),
      ],
      [
        "removals",
        value.removals.map((row) =>
          JSON.stringify([row.accountExternalId, row.externalId]),
        ),
      ],
    ] as const) {
      if (new Set(keys).size !== keys.length)
        ctx.addIssue({
          code: "custom",
          path: [name],
          message: "Duplicate prepared records",
        });
    }
  });
export const RecordProviderFailureSchema = z
  .strictObject({
    connectionId: z.uuid(),
    revision: z.number().int().nonnegative(),
    reason: z.enum(["retryable", "expired", "revoked", "invalid_data"]),
    observedAt: instant,
    retryAfter: instant.nullable(),
  })
  .refine((value) => value.reason === "retryable" || value.retryAfter === null);
export const ProviderSyncOutcomeSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("superseded") }),
  z.object({
    status: z.literal("failed"),
    reason: z.enum(["retryable", "expired", "revoked", "invalid_data"]),
    retryAfter: instant.nullable(),
  }),
  z.object({
    status: z.enum(["complete", "needs_review"]),
    conflictCount: z.number().int().nonnegative(),
    checkpoint: externalId.nullable(),
  }),
]);
export const ProviderReviewRecordsSchema = z
  .array(
    z.object({
      transactionId: z.uuid(),
      accountId: z.uuid(),
      reason: ProviderConflictReasonSchema,
      amount: money,
      type: z.enum(["debit", "credit"]),
      bookedAt: instant,
      tagId: z.uuid().nullable(),
      incomeSourceId: z.uuid().nullable(),
      previousFacts: z.record(z.string(), z.unknown()),
      incomingFacts: z.record(z.string(), z.unknown()),
    }),
  )
  .max(50000);

export type ProviderAccountRecord = z.infer<typeof ProviderAccountRecordSchema>;
export type ProviderSyncScope = z.infer<typeof ProviderSyncScopeSchema>;
export type ProviderSyncFacts = z.infer<typeof ProviderSyncFactsSchema>;
export type PreparedProviderAccount = z.infer<
  typeof PreparedProviderAccountSchema
>;
export type PreparedProviderMovement = z.infer<
  typeof PreparedProviderMovementSchema
>;
export type CommitProviderSync = z.infer<typeof CommitProviderSyncSchema>;
export type RecordProviderFailure = z.infer<typeof RecordProviderFailureSchema>;
export type ProviderSyncOutcome = z.infer<typeof ProviderSyncOutcomeSchema>;
