import { sql } from 'drizzle-orm';
import { boolean, check, index, integer, pgEnum, pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { account } from './account.table';
import { tag } from './tag.table';
import { user } from './user.table';

export const tagRuleFieldEnum = pgEnum('tag_rule_field', ['merchant', 'description']);
export const tagRuleDirectionEnum = pgEnum('tag_rule_direction', ['debit', 'credit']);
export const tagRuleModeEnum = pgEnum('tag_rule_mode', ['suggest', 'auto']);

export const tagRule = pgTable('tag_rule', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  tagId: uuid('tag_id').notNull().references(() => tag.id, { onDelete: 'restrict' }),
  accountId: uuid('account_id').references(() => account.id, { onDelete: 'restrict' }),
  direction: tagRuleDirectionEnum('direction').notNull(),
  matchField: tagRuleFieldEnum('match_field').notNull(),
  matchValue: varchar('match_value', { length: 240 }).notNull(),
  priority: integer('priority').notNull().default(0),
  mode: tagRuleModeEnum('mode').notNull().default('suggest'),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index('tag_rule_user_active_idx').on(t.userId, t.active),
  uniqueIndex('tag_rule_active_owner_match_uniq')
    .on(t.userId, t.tagId, t.direction, t.matchField, t.matchValue,
      sql`coalesce(${t.accountId}, '00000000-0000-0000-0000-000000000000'::uuid)`)
    .where(sql`${t.active} = true`),
  check('tag_rule_auto_approval_check', sql`(${t.mode} = 'auto' AND ${t.approvedAt} IS NOT NULL)
    OR (${t.mode} = 'suggest' AND ${t.approvedAt} IS NULL)`),
  check('tag_rule_match_nonempty_check', sql`length(trim(${t.matchValue})) > 0`),
]);

export type TagRuleRow = typeof tagRule.$inferSelect;
