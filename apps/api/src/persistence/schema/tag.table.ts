import { boolean, index, pgTable, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core';
import { user } from './user.table';

export const tag = pgTable(
  'tag',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 80 }).notNull(),
    color: varchar('color', { length: 7 }),
    isArchived: boolean('is_archived').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique('tag_user_name_uniq').on(t.userId, t.name),
    index('tag_user_id_idx').on(t.userId),
  ],
);

export type TagRow = typeof tag.$inferSelect;
export type NewTagRow = typeof tag.$inferInsert;
