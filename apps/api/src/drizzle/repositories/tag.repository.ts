import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DRIZZLE_PG_CLIENT } from '../drizzle.tokens';
import * as schema from '../schema';
import { tag } from '../schema/tag.table';
import { objectiveTag } from '../schema/objective-tag.table';
import { transactionTag } from '../schema/transaction-tag.table';

@Injectable()
export class TagRepository {
  constructor(
    @Inject(DRIZZLE_PG_CLIENT)
    private readonly db: PostgresJsDatabase<typeof schema>,
  ) {}

  async listForTransactions(userId: string, transactionIds: string[]) {
    return this.db
      .select({
        transactionId: transactionTag.transactionId,
        id: tag.id,
        name: tag.name,
        color: tag.color,
      })
      .from(transactionTag)
      .innerJoin(tag, eq(transactionTag.tagId, tag.id))
      .where(and(
        inArray(transactionTag.transactionId, transactionIds),
        eq(tag.userId, userId),
      ))
      .orderBy(asc(tag.name), asc(tag.id));
  }

  async listForObjectives(userId: string, objectiveIds: string[]) {
    return this.db
      .select({
        objectiveId: objectiveTag.objectiveId,
        id: tag.id,
        name: tag.name,
        color: tag.color,
      })
      .from(objectiveTag)
      .innerJoin(tag, eq(objectiveTag.tagId, tag.id))
      .where(and(
        inArray(objectiveTag.objectiveId, objectiveIds),
        eq(tag.userId, userId),
      ))
      .orderBy(asc(tag.name), asc(tag.id));
  }
}
