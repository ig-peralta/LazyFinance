import { Inject, Injectable } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DRIZZLE_PG_CLIENT } from '../drizzle.tokens';
import * as schema from '../schema';
import { account } from '../schema/account.table';
import { transaction } from '../schema/transaction.table';

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
      })
      .from(transaction)
      .innerJoin(account, eq(transaction.accountId, account.id))
      .where(eq(account.userId, userId))
      .orderBy(desc(transaction.bookedAt), desc(transaction.id))
      .limit(RECENT_LIMIT);
  }
}
