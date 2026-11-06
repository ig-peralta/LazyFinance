import { pgTable, primaryKey, uuid } from 'drizzle-orm/pg-core';
import { objective } from './objective.table';
import { tag } from './tag.table';

export const objectiveTag = pgTable(
  'objective_tag',
  {
    objectiveId: uuid('objective_id')
      .notNull()
      .references(() => objective.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tag.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.objectiveId, t.tagId] })],
);

export type ObjectiveTagRow = typeof objectiveTag.$inferSelect;
export type NewObjectiveTagRow = typeof objectiveTag.$inferInsert;
