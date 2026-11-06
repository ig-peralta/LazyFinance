import { pgTable, primaryKey, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { user } from './user.table';

export const externalIdentity = pgTable('external_identity', {
  provider: varchar('provider', { length: 40 }).notNull(),
  issuer: varchar('issuer', { length: 512 }).notNull(),
  providerSubject: varchar('provider_subject', { length: 256 }).notNull(),
  userId: uuid('user_id').notNull().references(() => user.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ name: 'external_identity_provider_issuer_subject_pk', columns: [
    table.provider, table.issuer, table.providerSubject,
  ] }),
  uniqueIndex('external_identity_user_provider_issuer_unique').on(
    table.userId, table.provider, table.issuer,
  ),
]);

export type ExternalIdentityRow = typeof externalIdentity.$inferSelect;
