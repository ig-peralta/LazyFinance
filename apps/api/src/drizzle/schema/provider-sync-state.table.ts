import { pgEnum, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { providerConnection } from './provider-connection.table';

export const providerSyncFailureEnum = pgEnum('provider_sync_failure', ['retryable', 'expired', 'revoked', 'invalid_data']);

// One state record per owned connection; absence means no sync has been tried.
export const providerSyncState = pgTable('provider_sync_state', {
  providerConnectionId: uuid('provider_connection_id').primaryKey()
    .references(() => providerConnection.id, { onDelete: 'cascade' }),
  checkpoint: varchar('checkpoint', { length: 512 }),
  lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }),
  lastSuccessAt: timestamp('last_success_at', { withTimezone: true }),
  lastFailureAt: timestamp('last_failure_at', { withTimezone: true }),
  lastFailureReason: providerSyncFailureEnum('last_failure_reason'),
  retryAfter: timestamp('retry_after', { withTimezone: true }),
});
