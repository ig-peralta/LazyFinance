import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DRIZZLE_PG_CLIENT } from '../drizzle.tokens';
import * as schema from '../schema';
import { user } from '../schema/user.table';

@Injectable()
export class UserRepository {
  constructor(
    @Inject(DRIZZLE_PG_CLIENT)
    private readonly db: PostgresJsDatabase<typeof schema>,
  ) {}

  async findByApiToken(token: string) {
    const [record] = await this.db
      .select({ id: user.id, email: user.email, name: user.name })
      .from(user)
      .where(eq(user.apiToken, token))
      .limit(1);

    return record ?? null;
  }
}
