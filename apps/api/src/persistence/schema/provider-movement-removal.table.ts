import { pgTable, primaryKey, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { providerConnection } from './provider-connection.table';
import { movementRemovalReasonEnum } from './transaction.table';

// Removals can arrive before the corresponding upsert; keep their scoped IDs
// so a replay cannot resurrect an already-withdrawn provider fact.
export const providerMovementRemoval = pgTable('provider_movement_removal', {
  providerConnectionId: uuid('provider_connection_id').notNull()
    .references(() => providerConnection.id, { onDelete: 'cascade' }),
  accountExternalId: varchar('account_external_id', { length: 512 }).notNull(),
  movementExternalId: varchar('movement_external_id', { length: 512 }).notNull(),
  reason: movementRemovalReasonEnum('reason').notNull(),
  observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
  providerUpdatedAt: timestamp('provider_updated_at', { withTimezone: true }),
}, (t) => [primaryKey({ columns: [t.providerConnectionId, t.accountExternalId, t.movementExternalId] })]);
