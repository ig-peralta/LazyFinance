import type { TagRepository } from '../drizzle/repositories/tag.repository';
import type { TransactionRepository } from '../drizzle/repositories/transaction.repository';
import { describe, expect, it, vi } from 'vitest';
import { SummariesService } from './summaries.service';

describe('SummariesService', () => {
  it('keeps overall totals separate from overlapping tag totals', async () => {
    const sumByMonthForUser = vi.fn(async () => ({ income: '1550000.00', spending: '10000.00' }));
    const sumDebitsByTagForMonth = vi.fn(async () => [
      { id: '00000000-0000-4000-8000-000000000031', name: 'Comida', color: null, amount: '10000.00', count: 1 },
      { id: '00000000-0000-4000-8000-000000000032', name: 'Ocio', color: null, amount: '10000.00', count: 1 },
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
      month: '2026-01', previousMonth: '2025-12',
      income: { current: '100000.01', previous: '100000.02', change: '-0.01' },
      spending: { current: '1000.00', previous: '1100.00', change: '-100.00' },
    });
    expect(sumDebitsByTagForMonth).not.toHaveBeenCalled();
    expect(sumByMonthForUser).toHaveBeenCalledWith('demo-id', '2025-12');
  });
});
