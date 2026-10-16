import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { describe, expect, it, vi } from 'vitest';
import * as schema from '../schema';
import { AccountRepository } from './account.repository';

describe('AccountRepository', () => {
  it('selects only account overview fields for active accounts owned by the user', async () => {
    const rows = [{
      id: '00000000-0000-4000-8000-000000000002',
      alias: 'Cuenta corriente',
      type: 'checking' as const,
      currency: 'CLP' as const,
      balance: '125000.00',
    }];
    const orderBy = vi.fn(async () => rows);
    const where = vi.fn((_condition: SQL) => ({ orderBy }));
    const from = vi.fn(() => ({ where }));
    const select = vi.fn((_fields: Record<string, unknown>) => ({ from }));
    const repository = new AccountRepository({ select } as unknown as PostgresJsDatabase<typeof schema>);
    const userId = '00000000-0000-4000-8000-000000000001';

    await expect(repository.listActiveForUser(userId)).resolves.toEqual(rows);
    expect(Object.keys(select.mock.calls[0][0])).toEqual(['id', 'alias', 'type', 'currency', 'balance']);

    const { sql, params } = new PgDialect().sqlToQuery(where.mock.calls[0][0]);
    expect(sql).toContain('user_id');
    expect(sql).toContain('active');
    expect(params).toEqual([userId, true]);
    expect(orderBy).toHaveBeenCalledOnce();
  });
});
