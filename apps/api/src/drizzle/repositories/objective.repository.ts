import { Inject, Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DRIZZLE_PG_CLIENT } from '../drizzle.tokens';
import * as schema from '../schema';
import { objective } from '../schema/objective.table';

@Injectable()
export class ObjectiveRepository {
  constructor(
    @Inject(DRIZZLE_PG_CLIENT)
    private readonly db: PostgresJsDatabase<typeof schema>,
  ) {}

  async listForUser(userId: string) {
    return this.db
      .select({
        id: objective.id,
        name: objective.name,
        amount: objective.amount,
        kind: objective.kind,
        intent: objective.intent,
        isRecurring: objective.isRecurring,
        period: objective.period,
        startDate: objective.startDate,
        endDate: objective.endDate,
      })
      .from(objective)
      .where(eq(objective.userId, userId))
      .orderBy(asc(objective.createdAt), asc(objective.id));
  }
}
