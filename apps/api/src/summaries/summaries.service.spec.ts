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
});
