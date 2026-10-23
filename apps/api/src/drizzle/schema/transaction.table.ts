import { relations, sql } from 'drizzle-orm';
import { boolean, check, date, index, jsonb, numeric, pgEnum, pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { account } from './account.table';
import { tag } from './tag.table';

export const transactionTypeEnum = pgEnum('transaction_type', ['debit', 'credit']);
export const bookedPrecisionEnum = pgEnum('booked_precision', ['instant', 'calendar_day']);
export const providerInternalAssessmentEnum = pgEnum('provider_internal_assessment', ['internal', 'external', 'unknown']);
export const movementRelationEnum = pgEnum('movement_relation', ['transfer_pair', 'card_payment_pair', 'reversal']);
export const movementRemovalReasonEnum = pgEnum('movement_removal_reason', ['removed', 'reversed']);

export const transaction = pgTable(
  'transaction',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => account.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id').references(() => tag.id, { onDelete: 'set null' }),
    bookedAt: timestamp('booked_at', { withTimezone: true }).notNull(),
    bookedPrecision: bookedPrecisionEnum('booked_precision').notNull().default('instant'),
    bookedOn: date('booked_on'),
    amount: numeric('amount', { precision: 15, scale: 2 }).notNull(),
    type: transactionTypeEnum('type').notNull(),
    source: varchar('source', { length: 16 }).$type<'manual' | 'provider'>().notNull().default('manual'),
    merchant: varchar('merchant', { length: 120 }),
    description: varchar('description', { length: 240 }),
    externalId: varchar('external_id', { length: 512 }),
    providerUpdatedAt: timestamp('provider_updated_at', { withTimezone: true }),
    providerKind: varchar('provider_kind', { length: 32 }).$type<'transfer' | 'card_payment' | 'reversal' | 'other' | 'unknown'>(),
    relationKind: movementRelationEnum('relation_kind'),
    relatedAccountExternalId: varchar('related_account_external_id', { length: 512 }),
    relatedMovementExternalId: varchar('related_movement_external_id', { length: 512 }),
    counterpartyHolder: jsonb('counterparty_holder').$type<{ scheme: string; value: string }>(),
    // True when this movement is between two accounts the same user owns
    // (an internal transfer or a credit-card payment) — set when the
    // movement is recorded, never inferred later from a tag's name.
    isInternalMovement: boolean('is_internal_movement'),
    providerInternalAssessment: providerInternalAssessmentEnum('provider_internal_assessment').notNull().default('unknown'),
    userInternalOverride: boolean('user_internal_override'),
    removedAt: timestamp('removed_at', { withTimezone: true }),
    removalReason: movementRemovalReasonEnum('removal_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('transaction_account_external_uniq')
      .on(t.accountId, t.externalId)
      .where(sql`${t.externalId} IS NOT NULL`),
    index('transaction_account_booked_idx').on(t.accountId, t.bookedAt),
    index('transaction_tag_id_idx').on(t.tagId),
    check('transaction_amount_nonzero_check', sql`${t.amount} != 0`),
    check(
      'transaction_type_amount_check',
      sql`(${t.type} = 'debit' AND ${t.amount} < 0) OR (${t.type} = 'credit' AND ${t.amount} > 0)`,
    ),
    check('transaction_source_check', sql`${t.source} IN ('manual', 'provider')`),
    check('transaction_booked_precision_check', sql`(${t.bookedPrecision} = 'instant' AND ${t.bookedOn} IS NULL)
      OR (${t.bookedPrecision} = 'calendar_day' AND ${t.bookedOn} IS NOT NULL)`),
    check('transaction_relation_check', sql`(${t.relationKind} IS NULL AND ${t.relatedAccountExternalId} IS NULL AND ${t.relatedMovementExternalId} IS NULL)
      OR (${t.relationKind} IS NOT NULL AND ${t.relatedAccountExternalId} IS NOT NULL AND ${t.relatedMovementExternalId} IS NOT NULL)`),
    check('transaction_removal_check', sql`(${t.removedAt} IS NULL AND ${t.removalReason} IS NULL)
      OR (${t.removedAt} IS NOT NULL AND ${t.removalReason} IS NOT NULL)`),
  ],
);

export type TransactionRow = typeof transaction.$inferSelect;
export type NewTransactionRow = typeof transaction.$inferInsert;

export const transactionRelations = relations(transaction, ({ one }) => ({
  account: one(account, {
    fields: [transaction.accountId],
    references: [account.id],
  }),
  tag: one(tag, {
    fields: [transaction.tagId],
    references: [tag.id],
  }),
}));
