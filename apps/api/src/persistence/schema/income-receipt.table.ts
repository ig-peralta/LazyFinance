import { index, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { incomeSource } from './income-source.table';
import { transaction } from './transaction.table';

export const incomeReceipt = pgTable('income_receipt', {
  transactionId: uuid('transaction_id').primaryKey().references(() => transaction.id, { onDelete: 'cascade' }),
  sourceId: uuid('source_id').notNull().references(() => incomeSource.id, { onDelete: 'restrict' }),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('income_receipt_source_id_idx').on(t.sourceId)]);
