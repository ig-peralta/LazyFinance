import type { IncomeSchedule } from '@lazyfinance/contracts';
import { sql } from 'drizzle-orm';
import { check, date, index, jsonb, numeric, pgEnum, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { currencyEnum } from './account.table';
import { user } from './user.table';

export const incomeRegularityEnum = pgEnum('income_regularity', ['regular', 'irregular']);
export const incomeAmountKindEnum = pgEnum('income_amount_kind', ['fixed', 'variable']);

export const incomeSource = pgTable('income_source', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 80 }).notNull(),
  currency: currencyEnum('currency').notNull().default('CLP'),
  regularity: incomeRegularityEnum('regularity').notNull(),
  amountKind: incomeAmountKindEnum('amount_kind').notNull(),
  expectedAmount: numeric('expected_amount', { precision: 15, scale: 2 }),
  schedule: jsonb('schedule').$type<IncomeSchedule>(),
  startDate: date('start_date').notNull(),
  endDate: date('end_date'),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index('income_source_user_id_idx').on(t.userId),
  check('income_source_amount_check', sql`${t.expectedAmount} IS NULL OR ${t.expectedAmount} > 0`),
  check('income_source_fixed_amount_check', sql`${t.amountKind} != 'fixed' OR ${t.expectedAmount} IS NOT NULL`),
  check('income_source_schedule_check', sql`(${t.regularity} = 'regular' AND ${t.schedule} IS NOT NULL) OR (${t.regularity} = 'irregular' AND ${t.schedule} IS NULL)`),
  check('income_source_dates_check', sql`${t.endDate} IS NULL OR ${t.endDate} >= ${t.startDate}`),
]);

export type IncomeSourceRow = typeof incomeSource.$inferSelect;
export type NewIncomeSourceRow = typeof incomeSource.$inferInsert;
