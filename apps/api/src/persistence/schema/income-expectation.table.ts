import { sql } from 'drizzle-orm';
import { boolean, check, date, index, numeric, pgTable, uuid } from 'drizzle-orm/pg-core';
import { incomeSource } from './income-source.table';

export const incomeExpectation = pgTable('income_expectation', {
  id: uuid('id').defaultRandom().primaryKey(),
  sourceId: uuid('source_id').notNull().references(() => incomeSource.id, { onDelete: 'cascade' }),
  date: date('date').notNull(),
  amount: numeric('amount', { precision: 15, scale: 2 }).notNull(),
  isEstimate: boolean('is_estimate').notNull().default(false),
}, (t) => [
  index('income_expectation_source_date_idx').on(t.sourceId, t.date),
  check('income_expectation_amount_check', sql`${t.amount} > 0`),
]);
