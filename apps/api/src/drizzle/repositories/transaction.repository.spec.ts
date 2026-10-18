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

  it('aggregates each non-transfer movement once within Santiago month boundaries', async () => {
    const where = vi.fn(async (_condition: SQL) => [{ income: '1550000.00', spending: '897740.00' }]);
    const innerJoin = vi.fn(() => ({ where }));
    const from = vi.fn(() => ({ innerJoin }));
    const select = vi.fn((_fields: Record<string, unknown>) => ({ from }));
    const repository = new TransactionRepository({ select } as unknown as PostgresJsDatabase<typeof schema>);
    const userId = '00000000-0000-4000-8000-000000000001';

    await expect(repository.sumByMonthForUser(userId, '2026-09')).resolves.toEqual({
      income: '1550000.00', spending: '897740.00',
    });
    expect(innerJoin).toHaveBeenCalledOnce();
    expect(Object.keys(select.mock.calls[0][0])).toEqual(['income', 'spending']);
    const query = new PgDialect().sqlToQuery(where.mock.calls[0][0]);
    expect(query.sql).toContain('America/Santiago');
    expect(query.sql).toContain('is_internal_movement');
    expect(query.params).toEqual([
      userId, '2026-09-01 00:00:00', '2026-10-01 00:00:00', false,
    ]);
  });

  it('excludes future-dated movements from an in-progress month', async () => {
    const where = vi.fn(async (_condition: SQL) => [{ income: '0', spending: '10.00' }]);
    const from = vi.fn(() => ({ innerJoin: () => ({ where }) }));
    const repository = new TransactionRepository({ select: () => ({ from }) } as unknown as PostgresJsDatabase<typeof schema>);
    const now = new Date('2026-10-16T15:00:00.000Z');

    await repository.sumByMonthForUser('demo-id', '2026-10', now);
    const query = new PgDialect().sqlToQuery(where.mock.calls[0][0]);
    expect(query.sql).toContain('<=');
    expect(query.params).toEqual([
      'demo-id', '2026-10-01 00:00:00', '2026-11-01 00:00:00',
      now.toISOString(), false,
    ]);
  });

  it('queries user-scoped tagged debits in a bounded Santiago date range', async () => {
    const where = vi.fn(async (_condition: SQL) => []);
    const innerJoin = vi.fn(() => ({ innerJoin, where }));
    const from = vi.fn(() => ({ innerJoin }));
    const select = vi.fn((_fields: Record<string, unknown>) => ({ from }));
    const repository = new TransactionRepository({ select } as unknown as PostgresJsDatabase<typeof schema>);
    await expect(repository.listTaggedDebitsForPeriod('demo-id', '2026-01-01 00:00:00', '2026-10-01 00:00:00')).resolves.toEqual([]);
    expect(Object.keys(select.mock.calls[0][0])).toEqual(['id', 'bookedAt', 'amount', 'tagId']);
    const sql = new PgDialect().sqlToQuery(where.mock.calls[0][0]);
    expect(sql.sql).toContain('America/Santiago');
    expect(sql.sql).toContain('is_internal_movement');
    expect(sql.params).toEqual([
      'demo-id', 'demo-id', 'debit', '2026-01-01 00:00:00', '2026-10-01 00:00:00', false,
    ]);
  });
});
