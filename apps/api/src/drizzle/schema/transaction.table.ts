import { relations, sql } from 'drizzle-orm';
import { check, index, numeric, pgEnum, pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { account } from './account.table';

export const transactionTypeEnum = pgEnum('transaction_type', ['debit', 'credit']);
export const transactionSourceEnum = pgEnum('transaction_source', ['manual', 'fintoc']);

export const transaction = pgTable(
  'transaction',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => account.id, { onDelete: 'cascade' }),
    bookedAt: timestamp('booked_at', { withTimezone: true }).notNull(),
    amount: numeric('amount', { precision: 15, scale: 2 }).notNull(),
    type: transactionTypeEnum('type').notNull(),
    source: transactionSourceEnum('source').notNull().default('fintoc'),
    merchant: varchar('merchant', { length: 120 }),
    description: varchar('description', { length: 240 }),
    externalId: varchar('external_id', { length: 64 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('transaction_account_external_uniq')
      .on(t.accountId, t.externalId)
      .where(sql`${t.externalId} IS NOT NULL`),
    index('transaction_account_booked_idx').on(t.accountId, t.bookedAt),
    check('transaction_amount_nonzero_check', sql`${t.amount} != 0`),
    check(
      'transaction_type_amount_check',
      sql`(${t.type} = 'debit' AND ${t.amount} < 0) OR (${t.type} = 'credit' AND ${t.amount} > 0)`,
    ),
  ],
);

export type TransactionRow = typeof transaction.$inferSelect;
export type NewTransactionRow = typeof transaction.$inferInsert;

export const transactionRelations = relations(transaction, ({ one }) => ({
  account: one(account, {
    fields: [transaction.accountId],
    references: [account.id],
  }),
}));
