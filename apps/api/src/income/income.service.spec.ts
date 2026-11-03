import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { IncomeRepository } from '../drizzle/repositories/income.repository';
import type { TransactionRepository } from '../drizzle/repositories/transaction.repository';
import { IncomeService } from './income.service';

describe('IncomeService', () => {
  it('projects future expectations without treating them as received income', async () => {
    const userId = '00000000-0000-4000-8000-000000000001';
    const now = new Date('2026-10-16T15:00:00.000Z');
    const sourceId = '00000000-0000-4000-8000-000000000002';
    const listSourcesForUser = vi.fn(async () => [{
      id: sourceId, userId, name: 'Sueldo', currency: 'CLP' as const,
      regularity: 'regular' as const, amountKind: 'fixed' as const,
      expectedAmount: '1500000.00', schedule: { frequency: 'monthly' as const, day: 25 },
      startDate: '2026-01-01', endDate: null, archivedAt: null,
      createdAt: now, updatedAt: now,
    }]);
    const listExpectationsForUser = vi.fn(async () => []);
    const listReceiptsForMonth = vi.fn(async () => []);
    const sumByMonthForUser = vi.fn(async () => ({
      receivedIncome: '0.00', unclassifiedCreditAmount: '0.00',
      unclassifiedCreditCount: 0, unresolvedMovementCount: 0,
    }));
    const snapshot = { listSourcesForUser, listExpectationsForUser, listReceiptsForMonth } as unknown as IncomeRepository;
    const transactions = { sumByMonthForUser } as unknown as TransactionRepository;
    const readSnapshot = vi.fn(async (work: (income: IncomeRepository, transactions: TransactionRepository) => Promise<unknown>) =>
      work(snapshot, transactions));
    const service = new IncomeService({ readSnapshot } as unknown as IncomeRepository);

    await expect(service.getSummaryForUser(userId, '9999-12', now)).resolves.toMatchObject({
      month: '9999-12', asOf: now.toISOString(), receivedIncome: '0.00',
      expectedIncome: { amount: '1500000.00', paymentCount: 1 },
      expectedPayments: [{ sourceId, date: '9999-12-25', amount: '1500000.00' }],
      receipts: [],
    });
    expect(listSourcesForUser).toHaveBeenCalledExactlyOnceWith(userId);
    expect(listExpectationsForUser).toHaveBeenCalledExactlyOnceWith(userId, undefined, '9999-12');
    expect(sumByMonthForUser).toHaveBeenCalledExactlyOnceWith(userId, '9999-12', now);
    expect(listReceiptsForMonth).toHaveBeenCalledExactlyOnceWith(userId, '9999-12', now);
  });

  it('rejects malformed months before querying income', async () => {
    const readSnapshot = vi.fn();
    const service = new IncomeService({ readSnapshot } as unknown as IncomeRepository);

    await expect(service.getSummaryForUser('demo-id', '2026-13')).rejects.toBeInstanceOf(BadRequestException);
    expect(readSnapshot).not.toHaveBeenCalled();
  });
});
