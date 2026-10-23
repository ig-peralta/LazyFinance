import { relations, sql } from 'drizzle-orm';
import { boolean, check, date, index, numeric, pgEnum, pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { providerConnection } from './provider-connection.table';
import { user } from './user.table';

export const accountTypeEnum = pgEnum('account_type', ['checking', 'savings', 'credit_card']);
export const currencyEnum = pgEnum('currency', ['CLP']);
export const historyCompletenessEnum = pgEnum('history_completeness', ['complete', 'partial', 'unknown']);

export const account = pgTable(
  'account',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    providerConnectionId: uuid('provider_connection_id')
      .notNull()
      .references(() => providerConnection.id, { onDelete: 'restrict' }),
    externalId: varchar('external_id', { length: 512 }),
    type: accountTypeEnum('type').notNull(),
    number: varchar('number', { length: 64 }),
    holderName: varchar('holder_name', { length: 120 }),
    holderRut: varchar('holder_rut', { length: 16 }),
    alias: varchar('alias', { length: 80 }),
    currency: currencyEnum('currency').notNull().default('CLP'),
    balance: numeric('balance', { precision: 15, scale: 2 }),
    active: boolean('active').notNull().default(true),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    historyCompleteness: historyCompletenessEnum('history_completeness').notNull().default('unknown'),
    historyFrom: date('history_from'),
    historyThrough: date('history_through'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex('account_connection_external_uniq').on(t.providerConnectionId, t.externalId),
    index('account_user_id_idx').on(t.userId),
    index('account_provider_connection_id_idx').on(t.providerConnectionId),
    check('account_history_window_check', sql`(${t.historyFrom} IS NULL OR ${t.historyThrough} IS NULL OR ${t.historyFrom} <= ${t.historyThrough})
      AND (${t.historyCompleteness} != 'complete' OR (${t.historyFrom} IS NOT NULL AND ${t.historyThrough} IS NOT NULL))
      AND (${t.historyCompleteness} != 'unknown' OR (${t.historyFrom} IS NULL AND ${t.historyThrough} IS NULL))`),
  ],
);

export type AccountRow = typeof account.$inferSelect;
export type NewAccountRow = typeof account.$inferInsert;

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
  providerConnection: one(providerConnection, {
    fields: [account.providerConnectionId],
    references: [providerConnection.id],
  }),
}));
