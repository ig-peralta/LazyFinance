import { index, pgEnum, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { tagRule } from './tag-rule.table';
import { tag } from './tag.table';
import { transaction } from './transaction.table';
import { user } from './user.table';

export const tagDecisionEventKindEnum = pgEnum('tag_decision_event_kind', [
  'manual_tag', 'manual_no_tag', 'reset', 'rule_applied', 'rule_revalidated',
]);

export const tagDecisionEvent = pgTable('tag_decision_event', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  transactionId: uuid('transaction_id').notNull().references(() => transaction.id, { onDelete: 'cascade' }),
  previousTagId: uuid('previous_tag_id').references(() => tag.id, { onDelete: 'set null' }),
  tagId: uuid('tag_id').references(() => tag.id, { onDelete: 'set null' }),
  ruleId: uuid('rule_id').references(() => tagRule.id, { onDelete: 'restrict' }),
  kind: tagDecisionEventKindEnum('kind').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('tag_decision_event_transaction_id_idx').on(t.transactionId, t.createdAt)]);
