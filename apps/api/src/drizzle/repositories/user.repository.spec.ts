import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { describe, expect, it, vi } from 'vitest';
import * as schema from '../schema';
import { UserRepository } from './user.repository';

function createRepository(rows: { id: string; email: string; name: string }[] = []) {
  const limit = vi.fn(async () => rows);
  const where = vi.fn((_condition: SQL) => ({ limit }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  const repository = new UserRepository({ select } as unknown as PostgresJsDatabase<typeof schema>);

  return { repository, where };
}

describe('UserRepository', () => {
  it('looks up the token with a parameterized query and returns the user', async () => {
    const record = {
      id: '00000000-0000-4000-8000-000000000001',
      email: 'demo@lazyfinance.cl',
      name: 'Camila Rojas',
    };
    const { repository, where } = createRepository([record]);

    await expect(repository.findByApiToken('lazyfinance-demo-token')).resolves.toEqual(record);

    const { sql, params } = new PgDialect().sqlToQuery(where.mock.calls[0][0]);
    expect(sql).toContain('api_token');
    expect(params).toEqual(['lazyfinance-demo-token']);
  });

  it('returns null when the token has no matching user', async () => {
    const { repository } = createRepository();

    await expect(repository.findByApiToken('unknown-token')).resolves.toBeNull();
  });
});
