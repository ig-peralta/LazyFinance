import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, lte, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DRIZZLE_PG_CLIENT } from '../drizzle.tokens';
import * as schema from '../schema';
import { account } from '../schema/account.table';
import { transaction } from '../schema/transaction.table';
import { tag } from '../schema/tag.table';
import { excludesInternalTransfers, inSantiagoPeriod, monthBounds } from './financial-filters';

const RECENT_LIMIT = 10;

@Injectable()
export class TransactionRepository {
  constructor(
    @Inject(DRIZZLE_PG_CLIENT)
    private readonly db: PostgresJsDatabase<typeof schema>,
  ) {}

  async listRecentForUser(userId: string) {
    return this.db
      .select({
        id: transaction.id,
        bookedAt: transaction.bookedAt,
        amount: transaction.amount,
        type: transaction.type,
        merchant: transaction.merchant,
        description: transaction.description,
        accountId: account.id,
        accountAlias: account.alias,
        accountType: account.type,
        currency: account.currency,
        tag: { id: tag.id, name: tag.name, color: tag.color },
      })
      .from(transaction)
      .innerJoin(account, eq(transaction.accountId, account.id))
      .leftJoin(tag, and(eq(transaction.tagId, tag.id), eq(tag.userId, userId)))
      .where(eq(account.userId, userId))
      .orderBy(desc(transaction.bookedAt), desc(transaction.id))
      .limit(RECENT_LIMIT);
  }

  async sumByMonthForUser(userId: string, month: string, asOf?: Date) {
    const { start, end } = monthBounds(month);
    return this.sumForPeriod(userId, start, end, asOf);
  }

  async sumForPeriod(userId: string, start: string, end: string, asOf?: Date) {
    const [row] = await this.db
      .select({
        income: sql<string>`coalesce(sum(case when ${transaction.type} = 'credit' then ${transaction.amount} else 0 end), 0)`,
        spending: sql<string>`coalesce(-sum(case when ${transaction.type} = 'debit' then ${transaction.amount} else 0 end), 0)`,
      })
      .from(transaction)
      .innerJoin(account, eq(transaction.accountId, account.id))
      .where(and(
        eq(account.userId, userId),
        inSantiagoPeriod(start, end),
        asOf ? lte(transaction.bookedAt, asOf) : undefined,
        excludesInternalTransfers(),
      ));
    return row;
  }

  async listTaggedDebitsForPeriod(userId: string, start: string, end: string, asOf?: Date) {
    return this.db
      .select({
        id: transaction.id,
        bookedAt: transaction.bookedAt,
        amount: transaction.amount,
        tagId: tag.id,
      })
      .from(transaction)
      .innerJoin(account, eq(transaction.accountId, account.id))
      .innerJoin(tag, eq(transaction.tagId, tag.id))
      .where(and(
        eq(account.userId, userId),
        eq(tag.userId, userId),
        eq(transaction.type, 'debit'),
        inSantiagoPeriod(start, end),
        asOf ? lte(transaction.bookedAt, asOf) : undefined,
        excludesInternalTransfers(),
      ));
  }
}
