import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { describe, expect, it, vi } from 'vitest';
import * as schema from '../schema';
import { TransactionRepository } from './transaction.repository';

describe('TransactionRepository', () => {
  it('queries the ten newest user-owned transactions with only their owner’s tag', async () => {
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
      tag: { id: '00000000-0000-4000-8000-000000000031', name: 'Suscripciones', color: null },
    }];
    const limit = vi.fn(async (_count: number) => rows);
    const orderBy = vi.fn((..._ordering: SQL[]) => ({ limit }));
    const where = vi.fn((_condition: SQL) => ({ orderBy }));
    const leftJoin = vi.fn((_table: unknown, _condition: SQL) => ({ where }));
    const from = vi.fn(() => ({ innerJoin: () => ({ leftJoin }) }));
    const select = vi.fn((_fields: Record<string, unknown>) => ({ from }));
    const repository = new TransactionRepository({ select } as unknown as PostgresJsDatabase<typeof schema>);
    const userId = '00000000-0000-4000-8000-000000000001';

    await expect(repository.listRecentForUser(userId)).resolves.toEqual(rows);
    expect(select).toHaveBeenCalledOnce();
    expect(Object.keys(select.mock.calls[0][0])).toEqual([
      'id', 'bookedAt', 'amount', 'type', 'merchant', 'description',
      'accountId', 'accountAlias', 'accountType', 'currency', 'tag',
    ]);
    expect(limit).toHaveBeenCalledWith(10);

    const dialect = new PgDialect();
    const ordering = orderBy.mock.calls[0].map((item) => dialect.sqlToQuery(item).sql);
    expect(ordering[0]).toMatch(/booked_at.*desc/i);
    expect(ordering[1]).toMatch(/transaction.*id.*desc/i);
    const filter = dialect.sqlToQuery(where.mock.calls[0][0]);
    expect(filter.sql).toContain('user_id');
    expect(filter.sql).toContain('removed_at');
    expect(filter.params).toEqual([userId]);
    const tagFilter = dialect.sqlToQuery(leftJoin.mock.calls[0][1]);
    expect(tagFilter.sql).toContain('tag_id');
    expect(tagFilter.sql).toContain('user_id');
    expect(tagFilter.params).toEqual([userId]);
  });

  it('aggregates each non-transfer movement once within Santiago month boundaries', async () => {
    const totals = { receivedIncome: '1550000.00', unclassifiedCreditAmount: '10000.00', unclassifiedCreditCount: 1, spending: '897740.00', unresolvedMovementCount: 0 };
    const where = vi.fn(async (_condition: SQL) => [totals]);
    const leftJoin = vi.fn((_table: unknown, _condition: SQL) => ({ leftJoin, where }));
    const innerJoin = vi.fn(() => ({ leftJoin }));
    const from = vi.fn(() => ({ innerJoin }));
    const select = vi.fn((_fields: Record<string, unknown>) => ({ from }));
    const repository = new TransactionRepository({ select } as unknown as PostgresJsDatabase<typeof schema>);
    const userId = '00000000-0000-4000-8000-000000000001';

    await expect(repository.sumByMonthForUser(userId, '2026-09')).resolves.toEqual(totals);
    expect(innerJoin).toHaveBeenCalledOnce();
    expect(Object.keys(select.mock.calls[0][0])).toEqual(['receivedIncome', 'unclassifiedCreditAmount', 'unclassifiedCreditCount', 'spending', 'unresolvedMovementCount']);
    const selections = select.mock.calls[0][0];
    expect(new PgDialect().sqlToQuery(selections.receivedIncome as SQL).sql).toContain('is_internal_movement');
    expect(new PgDialect().sqlToQuery(selections.unresolvedMovementCount as SQL).sql).toContain('IS NULL');
    expect(new PgDialect().sqlToQuery(leftJoin.mock.calls[1][1]).params).toEqual([userId]);
    const query = new PgDialect().sqlToQuery(where.mock.calls[0][0]);
    expect(query.sql).toContain('America/Santiago');
    expect(query.sql).toContain('removed_at');
    expect(query.sql).not.toContain('= false');
    expect(query.params).toEqual([
      userId, '2026-09-01 00:00:00', '2026-10-01 00:00:00',
    ]);
  });

  it('excludes future-dated movements from an in-progress month', async () => {
    const where = vi.fn(async (_condition: SQL) => [{ receivedIncome: '0', unclassifiedCreditAmount: '0', unclassifiedCreditCount: 0, spending: '10.00', unresolvedMovementCount: 0 }]);
    const leftJoin = vi.fn(() => ({ leftJoin, where }));
    const from = vi.fn(() => ({ innerJoin: () => ({ leftJoin }) }));
    const repository = new TransactionRepository({ select: () => ({ from }) } as unknown as PostgresJsDatabase<typeof schema>);
    const now = new Date('2026-10-16T15:00:00.000Z');

    await repository.sumByMonthForUser('demo-id', '2026-10', now);
    const query = new PgDialect().sqlToQuery(where.mock.calls[0][0]);
    expect(query.sql).toContain('<=');
    expect(query.params).toEqual([
      'demo-id', '2026-10-01 00:00:00', '2026-11-01 00:00:00',
      now.toISOString(),
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
    expect(sql.sql).toContain('removed_at');
    expect(sql.params).toEqual([
      'demo-id', 'demo-id', 'debit', '2026-01-01 00:00:00', '2026-10-01 00:00:00', false,
    ]);
  });
});
