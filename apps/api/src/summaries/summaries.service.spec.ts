import type { TagRepository } from '../drizzle/repositories/tag.repository';
import type { TransactionRepository } from '../drizzle/repositories/transaction.repository';
import { describe, expect, it, vi } from 'vitest';
import { SummariesService } from './summaries.service';

describe('SummariesService', () => {
  it('includes untagged spending in the total beyond the exclusive tag breakdown', async () => {
    const sumByMonthForUser = vi.fn(async () => ({ income: '1550000.00', spending: '10000.00' }));
    const sumDebitsByTagForMonth = vi.fn(async () => [
      { id: '00000000-0000-4000-8000-000000000031', name: 'Comida', color: null, amount: '4000.00', count: 1 },
      { id: '00000000-0000-4000-8000-000000000032', name: 'Ocio', color: null, amount: '5000.00', count: 1 },
    ]);
    const service = new SummariesService(
      { sumByMonthForUser } as unknown as TransactionRepository,
      { sumDebitsByTagForMonth } as unknown as TagRepository,
    );
    const userId = '00000000-0000-4000-8000-000000000001';

    const summary = await service.getMonthlyForUser(userId, '2026-09');
    expect(summary).toMatchObject({ month: '2026-09', income: '1550000.00', spending: '10000.00' });
    expect(summary.tags).toHaveLength(2);
    expect(sumByMonthForUser).toHaveBeenCalledWith(userId, '2026-09');
    expect(sumDebitsByTagForMonth).toHaveBeenCalledWith(userId, '2026-09');
  });

  it('compares adjacent months without tag joins or floating point money math', async () => {
    const sumByMonthForUser = vi.fn(async (_id: string, month: string) => month === '2026-01'
      ? { income: '100000.01', spending: '1000.00' }
      : { income: '100000.02', spending: '1100.00' });
    const sumDebitsByTagForMonth = vi.fn();
    const service = new SummariesService(
      { sumByMonthForUser } as unknown as TransactionRepository,
      { sumDebitsByTagForMonth } as unknown as TagRepository,
    );

    await expect(service.getComparisonForUser('demo-id', '2026-01')).resolves.toEqual({
      month: '2026-01', previousMonth: '2025-12', partial: false,
      income: { current: '100000.01', previous: '100000.02', change: '-0.01' },
      spending: { current: '1000.00', previous: '1100.00', change: '-100.00' },
    });
    expect(sumDebitsByTagForMonth).not.toHaveBeenCalled();
    expect(sumByMonthForUser).toHaveBeenCalledWith('demo-id', '2025-12');
  });

  it('cuts off the current month at now and compares the same day in the preceding month', async () => {
    const now = new Date('2026-10-16T15:30:45.000Z');
    const sumByMonthForUser = vi.fn(async () => ({ income: '100.00', spending: '50.00' }));
    const sumForPeriod = vi.fn(async () => ({ income: '80.00', spending: '75.00' }));
    const sumDebitsByTagForMonth = vi.fn(async () => []);
    const service = new SummariesService(
      { sumByMonthForUser, sumForPeriod } as unknown as TransactionRepository,
      { sumDebitsByTagForMonth } as unknown as TagRepository,
    );

    await service.getMonthlyForUser('demo-id', '2026-10', now);
    expect(sumByMonthForUser).toHaveBeenCalledWith('demo-id', '2026-10', now);
    expect(sumDebitsByTagForMonth).toHaveBeenCalledWith('demo-id', '2026-10', now);

    const comparison = await service.getComparisonForUser('demo-id', '2026-10', now);
    expect(comparison).toMatchObject({ partial: true, previousMonth: '2026-09' });
    expect(comparison.spending.change).toBe('-25.00');
    expect(sumForPeriod).toHaveBeenCalledWith(
      'demo-id', '2026-09-01 00:00:00', '2026-09-16 12:30:45',
    );
  });

  it('uses the entire preceding month if it has fewer days than the current date', async () => {
    const now = new Date('2026-03-31T15:00:00.000Z');
    const sumForPeriod = vi.fn(async () => ({ income: '0', spending: '0' }));
    const service = new SummariesService(
      { sumByMonthForUser: vi.fn(async () => ({ income: '0', spending: '0' })), sumForPeriod } as unknown as TransactionRepository,
      {} as TagRepository,
    );

    await service.getComparisonForUser('demo-id', '2026-03', now);
    expect(sumForPeriod).toHaveBeenCalledWith(
      'demo-id', '2026-02-01 00:00:00', '2026-03-01 00:00:00',
    );
  });
});
