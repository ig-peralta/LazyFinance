import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { describe, expect, it, vi } from 'vitest';
import * as schema from '../schema';
import { ObjectiveRepository } from './objective.repository';

describe('ObjectiveRepository', () => {
  it('only reads objective fields owned by the user in stable order', async () => {
    const orderBy = vi.fn(async (..._order: SQL[]) => []);
    const where = vi.fn((_condition: SQL) => ({ orderBy }));
    const from = vi.fn(() => ({ where }));
    const select = vi.fn((_fields: Record<string, unknown>) => ({ from }));
    const repository = new ObjectiveRepository({ select } as unknown as PostgresJsDatabase<typeof schema>);
    const userId = '00000000-0000-4000-8000-000000000001';

    await expect(repository.listForUser(userId)).resolves.toEqual([]);
    expect(select).toHaveBeenCalledOnce();
    expect(Object.keys(select.mock.calls[0][0])).toEqual([
      'id', 'name', 'amount', 'kind', 'intent', 'isRecurring', 'period', 'startDate', 'endDate',
    ]);
    expect(new PgDialect().sqlToQuery(where.mock.calls[0][0]).params).toEqual([userId]);
    expect(orderBy).toHaveBeenCalledOnce();
  });
});
