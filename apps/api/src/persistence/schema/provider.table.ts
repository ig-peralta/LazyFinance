import { pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const provider = pgTable('provider', {
  id: uuid('id').defaultRandom().primaryKey(),
  identifier: varchar('identifier', { length: 64 }).notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type ProviderRow = typeof provider.$inferSelect;
export type NewProviderRow = typeof provider.$inferInsert;
