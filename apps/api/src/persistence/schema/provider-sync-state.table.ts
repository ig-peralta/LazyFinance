import { check, integer, pgEnum, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { providerConnection } from './provider-connection.table';

export const providerSyncFailureEnum = pgEnum('provider_sync_failure', ['retryable', 'expired', 'revoked', 'invalid_data']);
export const providerSyncResultEnum = pgEnum('provider_sync_result', ['complete', 'needs_review']);

// One state record per owned connection; absence means no sync has been tried.
export const providerSyncState = pgTable('provider_sync_state', {
  providerConnectionId: uuid('provider_connection_id').primaryKey()
    .references(() => providerConnection.id, { onDelete: 'cascade' }),
  checkpoint: varchar('checkpoint', { length: 512 }),
  revision: integer('revision').notNull().default(0),
  lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }),
  lastSuccessAt: timestamp('last_success_at', { withTimezone: true }),
  lastProviderObservedAt: timestamp('last_provider_observed_at', { withTimezone: true }),
  lastResult: providerSyncResultEnum('last_result'),
  unresolvedConflictCount: integer('unresolved_conflict_count').notNull().default(0),
  lastFailureAt: timestamp('last_failure_at', { withTimezone: true }),
  lastFailureReason: providerSyncFailureEnum('last_failure_reason'),
  retryAfter: timestamp('retry_after', { withTimezone: true }),
}, (t) => [
  check('provider_sync_state_revision_check', sql`${t.revision} >= 0`),
  check('provider_sync_state_conflict_count_check', sql`${t.unresolvedConflictCount} >= 0`),
]);
