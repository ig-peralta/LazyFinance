import { sql } from 'drizzle-orm';
import { boolean, check, index, numeric, pgEnum, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { user } from './user.table';

export const objectiveKindEnum = pgEnum('objective_kind', ['time_based', 'amount_based']);
export const objectiveIntentEnum = pgEnum('objective_intent', ['spending', 'saving']);
export const objectivePeriodEnum = pgEnum('objective_period', ['daily', 'weekly', 'monthly', 'yearly']);

export const objective = pgTable(
  'objective',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 80 }).notNull(),
    amount: numeric('amount', { precision: 15, scale: 2 }).notNull(),
    kind: objectiveKindEnum('kind').notNull(),
    intent: objectiveIntentEnum('intent').notNull(),
    isRecurring: boolean('is_recurring'),
    period: objectivePeriodEnum('period'),
    startDate: timestamp('start_date', { withTimezone: true }),
    endDate: timestamp('end_date', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index('objective_user_id_idx').on(t.userId),
    check('objective_amount_positive_check', sql`${t.amount} > 0`),
    check(
      'objective_kind_period_check',
      sql`(
        (${t.kind} = 'amount_based' AND ${t.isRecurring} IS NULL AND ${t.period} IS NULL AND ${t.startDate} IS NULL AND ${t.endDate} IS NULL) OR
        (${t.kind} = 'time_based' AND ${t.isRecurring} = true AND ${t.period} IS NOT NULL AND ${t.startDate} IS NOT NULL) OR
        (${t.kind} = 'time_based' AND ${t.isRecurring} = false AND ${t.period} IS NULL AND ${t.startDate} IS NOT NULL AND ${t.endDate} IS NOT NULL)
      )`,
    ),
    check('objective_dates_order_check', sql`${t.endDate} IS NULL OR ${t.startDate} IS NULL OR ${t.endDate} > ${t.startDate}`),
  ],
);

export type ObjectiveRow = typeof objective.$inferSelect;
export type NewObjectiveRow = typeof objective.$inferInsert;
