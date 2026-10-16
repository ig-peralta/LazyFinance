import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { describe, expect, it, vi } from 'vitest';
import * as schema from '../schema';
import { TransactionRepository } from './transaction.repository';

describe('TransactionRepository', () => {
  it('queries only the ten newest transactions belonging to the user', async () => {
    const rows = [{
      id: '00000000-0000-4000-8000-000000000011',
      bookedAt: new Date('2026-10-15T15:00:00.000Z'),
      amount: '-49990.00',
      type: 'debit',
      merchant: 'Netflix',
      description: null,
      accountId: '00000000-0000-4000-8000-000000000021',
      accountAlias: 'Tarjeta',
      accountType: 'credit_card',
      currency: 'CLP',
    }];
    const limit = vi.fn(async (_count: number) => rows);
    const orderBy = vi.fn((..._ordering: SQL[]) => ({ limit }));
    const where = vi.fn((_condition: SQL) => ({ orderBy }));
    const from = vi.fn(() => ({ innerJoin: () => ({ where }) }));
    const select = vi.fn((_fields: Record<string, unknown>) => ({ from }));
    const repository = new TransactionRepository({ select } as unknown as PostgresJsDatabase<typeof schema>);
    const userId = '00000000-0000-4000-8000-000000000001';

    await expect(repository.listRecentForUser(userId)).resolves.toEqual(rows);
    expect(select).toHaveBeenCalledOnce();
    expect(Object.keys(select.mock.calls[0][0])).toEqual([
      'id', 'bookedAt', 'amount', 'type', 'merchant', 'description',
      'accountId', 'accountAlias', 'accountType', 'currency',
    ]);
    expect(limit).toHaveBeenCalledWith(10);

    const dialect = new PgDialect();
    const ordering = orderBy.mock.calls[0].map((item) => dialect.sqlToQuery(item).sql);
    expect(ordering[0]).toMatch(/booked_at.*desc/i);
    expect(ordering[1]).toMatch(/transaction.*id.*desc/i);
    const filter = dialect.sqlToQuery(where.mock.calls[0][0]);
    expect(filter.sql).toContain('user_id');
    expect(filter.params).toEqual([userId]);
  });
});
