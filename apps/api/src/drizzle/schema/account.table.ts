import { relations } from 'drizzle-orm';
import { boolean, index, numeric, pgEnum, pgTable, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core';
import { providerConnection } from './provider-connection.table';
import { user } from './user.table';

export const accountTypeEnum = pgEnum('account_type', ['checking', 'savings', 'credit_card']);
export const currencyEnum = pgEnum('currency', ['CLP']);

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
    type: accountTypeEnum('type').notNull(),
    number: varchar('number', { length: 64 }).notNull(),
    holderName: varchar('holder_name', { length: 120 }).notNull(),
    holderRut: varchar('holder_rut', { length: 16 }),
    alias: varchar('alias', { length: 80 }),
    currency: currencyEnum('currency').notNull().default('CLP'),
    balance: numeric('balance', { precision: 15, scale: 2 }).notNull().default('0'),
    active: boolean('active').notNull().default(true),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique('account_user_type_number_uniq').on(t.userId, t.type, t.number),
    index('account_user_id_idx').on(t.userId),
    index('account_provider_connection_id_idx').on(t.providerConnectionId),
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
