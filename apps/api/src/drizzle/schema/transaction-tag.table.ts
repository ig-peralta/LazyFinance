import { pgTable, primaryKey, uuid } from 'drizzle-orm/pg-core';
import { tag } from './tag.table';
import { transaction } from './transaction.table';

export const transactionTag = pgTable(
  'transaction_tag',
  {
    transactionId: uuid('transaction_id')
      .notNull()
      .references(() => transaction.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tag.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.transactionId, t.tagId] })],
);

export type TransactionTagRow = typeof transactionTag.$inferSelect;
export type NewTransactionTagRow = typeof transactionTag.$inferInsert;
