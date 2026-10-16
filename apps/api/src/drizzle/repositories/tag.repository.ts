import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DRIZZLE_PG_CLIENT } from '../drizzle.tokens';
import * as schema from '../schema';
import { tag } from '../schema/tag.table';
import { objectiveTag } from '../schema/objective-tag.table';
import { transactionTag } from '../schema/transaction-tag.table';
import { account } from '../schema/account.table';
import { transaction } from '../schema/transaction.table';
import { excludesInternalTransfers, inSantiagoPeriod, monthBounds } from './financial-filters';

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

  async sumDebitsByTagForMonth(userId: string, month: string) {
    const { start, end } = monthBounds(month);
    const amount = sql<string>`-sum(${transaction.amount})`;
    return this.db
      .select({
        id: tag.id,
        name: tag.name,
        color: tag.color,
        amount,
        count: sql<number>`count(distinct ${transaction.id})::int`,
      })
      .from(transaction)
      .innerJoin(account, eq(transaction.accountId, account.id))
      .innerJoin(transactionTag, eq(transactionTag.transactionId, transaction.id))
      .innerJoin(tag, eq(transactionTag.tagId, tag.id))
      .where(and(
        eq(account.userId, userId),
        eq(tag.userId, userId),
        eq(transaction.type, 'debit'),
        inSantiagoPeriod(start, end),
        excludesInternalTransfers(userId),
      ))
      .groupBy(tag.id, tag.name, tag.color)
      .orderBy(desc(amount), asc(tag.name));
  }
}
