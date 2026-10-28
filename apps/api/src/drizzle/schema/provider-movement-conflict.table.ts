import { jsonb, pgEnum, pgTable, primaryKey, timestamp, uuid } from 'drizzle-orm/pg-core';
import { transaction } from './transaction.table';

export const providerMovementConflictReasonEnum = pgEnum('provider_movement_conflict_reason', [
  'receipt_incompatible', 'internal_override_disagrees', 'removed_confirmed_income',
]);

// Provider corrections remain bank facts; this row preserves the displaced
// interpretation and evidence for a later user review, without clearing tags,
// income receipt links or an explicit internal-movement override.
export const providerMovementConflict = pgTable('provider_movement_conflict', {
  transactionId: uuid('transaction_id').notNull().references(() => transaction.id, { onDelete: 'cascade' }),
  reason: providerMovementConflictReasonEnum('reason').notNull(),
  previousFacts: jsonb('previous_facts').$type<Record<string, unknown>>().notNull(),
  incomingFacts: jsonb('incoming_facts').$type<Record<string, unknown>>().notNull(),
  observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
}, (t) => [primaryKey({ columns: [t.transactionId, t.reason] })]);
