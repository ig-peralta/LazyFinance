import type { AccountRepository } from '../drizzle/repositories/account.repository';
import { describe, expect, it, vi } from 'vitest';
import { AccountsService } from './accounts.service';

const userId = '00000000-0000-4000-8000-000000000001';

describe('AccountsService', () => {
  it('reports no known sync time rather than inventing one', async () => {
    const listActiveForUser = vi.fn(async () => [{
      id: '00000000-0000-4000-8000-000000000002',
      alias: 'Cuenta corriente',
      type: 'checking' as const,
      currency: 'CLP' as const,
      balance: '125000.00',
      lastSyncedAt: null,
    }]);
    const service = new AccountsService({ listActiveForUser } as unknown as AccountRepository);

    await expect(service.getActiveForUser(userId)).resolves.toEqual([{
      id: '00000000-0000-4000-8000-000000000002',
      alias: 'Cuenta corriente',
      type: 'checking',
      currency: 'CLP',
      balance: '125000.00',
      lastSyncedAt: null,
    }]);
  });

  it('serializes a known sync time as an ISO string', async () => {
    const listActiveForUser = vi.fn(async () => [{
      id: '00000000-0000-4000-8000-000000000003',
      alias: 'Tarjeta',
      type: 'credit_card' as const,
      currency: 'CLP' as const,
      balance: '-49990.00',
      lastSyncedAt: new Date('2026-10-15T15:00:00.000Z'),
    }]);
    const service = new AccountsService({ listActiveForUser } as unknown as AccountRepository);

    const [account] = await service.getActiveForUser(userId);
    expect(account.lastSyncedAt).toBe('2026-10-15T15:00:00.000Z');
  });
});
