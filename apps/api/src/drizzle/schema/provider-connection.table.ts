import { relations } from 'drizzle-orm';
import { index, jsonb, pgEnum, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { provider } from './provider.table';
import { user } from './user.table';

export const connectionStatusEnum = pgEnum('connection_status', ['active', 'revoked', 'expired']);
export const connectionModeEnum = pgEnum('connection_mode', ['test', 'live']);

export const providerConnection = pgTable(
  'provider_connection',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    providerId: uuid('provider_id')
      .notNull()
      .references(() => provider.id),
    metadata: jsonb('metadata')
      // NOTE: this type is just a placeholder, the idea is that in the future
      // we should have a type that is a union of all the metadata types of the
      // implemented providers
      .$type<{ link_token?: string; holder_id?: string; link_id?: string }>()
      .notNull()
      .default({}),
    status: connectionStatusEnum('status').notNull().default('active'),
    mode: connectionModeEnum('mode'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index('provider_connection_user_id_idx').on(t.userId),
    index('provider_connection_provider_id_idx').on(t.providerId),
  ],
);

export type ProviderConnectionRow = typeof providerConnection.$inferSelect;
export type NewProviderConnectionRow = typeof providerConnection.$inferInsert;

export const providerConnectionRelations = relations(providerConnection, ({ one }) => ({
  user: one(user, { fields: [providerConnection.userId], references: [user.id] }),
  providerRef: one(provider, {
    fields: [providerConnection.providerId],
    references: [provider.id],
  }),
}));
