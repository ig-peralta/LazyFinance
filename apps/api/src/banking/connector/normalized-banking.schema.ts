import { z } from 'zod';

// External identifiers are opaque. In particular, trimming or deriving them
// from account numbers would change the identity of a provider record.
export const ExternalIdSchema = z.string().min(1).max(512)
  .refine((value) => value.trim().length > 0, 'An external identifier is required');

const InstantSchema = z.iso.datetime();

const MoneySchema = z.string().regex(/^-?(0|[1-9]\d{0,12})\.\d{2}$/, 'Expected a CLP decimal with two places')
  .refine((value) => value !== '-0.00', 'Negative zero is not an amount');

const MovementAmountSchema = MoneySchema.refine((value) => value !== '0.00', 'A booked movement cannot be zero');

export const BookingDateSchema = z.discriminatedUnion('precision', [
  z.object({ precision: z.literal('instant'), at: InstantSchema }).strict(),
  z.object({ precision: z.literal('calendar_day'), on: z.iso.date(), timeZone: z.literal('America/Santiago') }).strict(),
]);

export const HistoryCoverageSchema = z.object({
  completeness: z.enum(['complete', 'partial', 'unknown']),
  from: z.iso.date().nullable(),
  through: z.iso.date().nullable(),
}).strict().superRefine((coverage, ctx) => {
  if (coverage.from !== null && coverage.through !== null && coverage.from > coverage.through) {
    ctx.addIssue({ code: 'custom', path: ['through'], message: 'History ends before it starts' });
  }
  if (coverage.completeness === 'complete' && (coverage.from === null || coverage.through === null)) {
    ctx.addIssue({ code: 'custom', path: ['completeness'], message: 'Completeness requires a bounded window' });
  }
  if (coverage.completeness === 'unknown' && (coverage.from !== null || coverage.through !== null)) {
    ctx.addIssue({ code: 'custom', path: ['completeness'], message: 'Unknown coverage has no known window' });
  }
});

export const ReportedBalanceSchema = z.object({
  amount: MoneySchema,
  meaning: z.enum(['cash_balance', 'card_liability']),
  // A fetch time is not a substitute for a source-confirmed balance time.
  asOf: InstantSchema.nullable(),
}).strict();

export const NormalizedAccountSnapshotSchema = z.object({
  externalId: ExternalIdSchema,
  type: z.enum(['checking', 'savings', 'credit_card']),
  currency: z.literal('CLP'),
  number: z.string().min(1).max(64).nullable(),
  holderName: z.string().min(1).max(120).nullable(),
  reportedBalance: ReportedBalanceSchema.nullable(),
  historyCoverage: HistoryCoverageSchema,
}).strict().superRefine((account, ctx) => {
  if (account.reportedBalance !== null && account.reportedBalance.meaning !==
    (account.type === 'credit_card' ? 'card_liability' : 'cash_balance')) {
    ctx.addIssue({ code: 'custom', path: ['reportedBalance', 'meaning'], message: 'Balance meaning does not match account type' });
  }
});

const RelatedMovementSchema = z.object({
  kind: z.enum(['transfer_pair', 'card_payment_pair', 'reversal']),
  accountExternalId: ExternalIdSchema,
  movementExternalId: ExternalIdSchema,
}).strict();

const HolderIdentifierSchema = z.object({
  scheme: z.string().min(1).max(64),
  value: z.string().min(1).max(128),
}).strict();

export const NormalizedMovementSchema = z.object({
  accountExternalId: ExternalIdSchema,
  externalId: ExternalIdSchema,
  booked: BookingDateSchema,
  // A negative amount is a debit, a positive amount is a credit, including on cards.
  amount: MovementAmountSchema,
  description: z.string().max(240).nullable(),
  merchant: z.string().max(120).nullable(),
  providerUpdatedAt: InstantSchema.nullable(),
  providerKind: z.enum(['transfer', 'card_payment', 'reversal', 'other', 'unknown']),
  relatedMovement: RelatedMovementSchema.nullable(),
  counterpartyHolder: HolderIdentifierSchema.nullable(),
}).strict();

// A provider may retract a previously confirmed movement without supplying
// its amount or date again. Keep the stable identity so ingestion can mark the
// original as removed without erasing user-owned classifications or receipts.
export const MovementRemovalSchema = z.object({
  accountExternalId: ExternalIdSchema,
  externalId: ExternalIdSchema,
  reason: z.enum(['removed', 'reversed']),
  providerUpdatedAt: InstantSchema.nullable(),
}).strict();

export const ConnectorPageSchema = z.object({
  kind: z.literal('page'),
  observedAt: InstantSchema,
  accounts: z.array(NormalizedAccountSnapshotSchema),
  movements: z.array(NormalizedMovementSchema),
  removedMovements: z.array(MovementRemovalSchema),
  // Within-run pagination; never persisted as the next refresh checkpoint.
  nextCursor: ExternalIdSchema.nullable(),
  // Candidate for the next run, supplied only on its final page.
  checkpoint: ExternalIdSchema.nullable(),
  complete: z.boolean(),
}).strict().superRefine((page, ctx) => {
  if (page.complete !== (page.nextCursor === null)) {
    ctx.addIssue({ code: 'custom', path: ['nextCursor'], message: 'A complete page must end the cursor chain' });
  }
  if (!page.complete && page.checkpoint !== null) {
    ctx.addIssue({ code: 'custom', path: ['checkpoint'], message: 'Only a completed run can provide a checkpoint' });
  }

  const accounts = new Set<string>();
  for (const [index, account] of page.accounts.entries()) {
    if (accounts.has(account.externalId)) {
      ctx.addIssue({ code: 'custom', path: ['accounts', index, 'externalId'], message: 'Duplicate account in page' });
    }
    accounts.add(account.externalId);
  }

  const movements = new Set<string>();
  for (const [index, movement] of page.movements.entries()) {
    const key = JSON.stringify([movement.accountExternalId, movement.externalId]);
    if (movements.has(key)) {
      ctx.addIssue({ code: 'custom', path: ['movements', index, 'externalId'], message: 'Duplicate movement in account' });
    }
    movements.add(key);
  }
  for (const [index, removal] of page.removedMovements.entries()) {
    const key = JSON.stringify([removal.accountExternalId, removal.externalId]);
    if (movements.has(key)) {
      ctx.addIssue({ code: 'custom', path: ['removedMovements', index, 'externalId'], message: 'Conflicting movement changes in page' });
    }
    movements.add(key);
  }
});

export const ConnectorFailureSchema = z.object({
  kind: z.literal('failure'),
  reason: z.enum(['retryable', 'expired', 'revoked', 'invalid_data']),
  observedAt: InstantSchema,
  retryAfter: InstantSchema.nullable(),
}).strict().superRefine((failure, ctx) => {
  if (failure.reason !== 'retryable' && failure.retryAfter !== null) {
    ctx.addIssue({ code: 'custom', path: ['retryAfter'], message: 'Only retryable failures can specify a retry time' });
  }
});

export const ConnectorResultSchema = z.discriminatedUnion('kind', [ConnectorPageSchema, ConnectorFailureSchema]);

export type NormalizedAccountSnapshot = z.infer<typeof NormalizedAccountSnapshotSchema>;
export type NormalizedMovement = z.infer<typeof NormalizedMovementSchema>;
export type MovementRemoval = z.infer<typeof MovementRemovalSchema>;
export type ConnectorPage = z.infer<typeof ConnectorPageSchema>;
export type ConnectorFailure = z.infer<typeof ConnectorFailureSchema>;
export type ConnectorResult = z.infer<typeof ConnectorResultSchema>;
