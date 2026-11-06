import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DRIZZLE_PG_CLIENT } from '../drizzle.tokens';
import * as schema from '../schema';
import { account } from '../schema/account.table';

@Injectable()
export class AccountRepository {
  constructor(
    @Inject(DRIZZLE_PG_CLIENT)
    private readonly db: PostgresJsDatabase<typeof schema>,
  ) {}

  listActiveForUser(userId: string) {
    return this.db
      .select({
        id: account.id,
        alias: account.alias,
        type: account.type,
        currency: account.currency,
        balance: account.balance,
        lastSyncedAt: account.lastSyncedAt,
      })
      .from(account)
      .where(and(eq(account.userId, userId), eq(account.active, true)))
      .orderBy(asc(account.createdAt), asc(account.id));
  }
}
