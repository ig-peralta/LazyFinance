import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { describe, expect, it, vi } from 'vitest';
import * as schema from '../schema';
import { TagRepository } from './tag.repository';

describe('TagRepository', () => {
  it('queries tags only for the selected transactions and their owner', async () => {
    const rows = [{
      transactionId: '00000000-0000-4000-8000-000000000011',
      id: '00000000-0000-4000-8000-000000000031',
      name: 'Ocio',
      color: '#9333EA',
    }];
    const orderBy = vi.fn(async (..._ordering: SQL[]) => rows);
    const where = vi.fn((_condition: SQL) => ({ orderBy }));
    const from = vi.fn(() => ({ innerJoin: () => ({ where }) }));
    const select = vi.fn((_fields: Record<string, unknown>) => ({ from }));
    const repository = new TagRepository({ select } as unknown as PostgresJsDatabase<typeof schema>);
    const userId = '00000000-0000-4000-8000-000000000001';
    const transactionIds = [rows[0].transactionId, '00000000-0000-4000-8000-000000000012'];

    await expect(repository.listForTransactions(userId, transactionIds)).resolves.toEqual(rows);
    expect(select).toHaveBeenCalledOnce();
    expect(Object.keys(select.mock.calls[0][0])).toEqual(['transactionId', 'id', 'name', 'color']);

    const filter = new PgDialect().sqlToQuery(where.mock.calls[0][0]);
    expect(filter.sql).toContain('transaction_id');
    expect(filter.sql).toContain('user_id');
    expect(filter.params).toEqual([...transactionIds, userId]);
    expect(orderBy).toHaveBeenCalledOnce();
  });
});
