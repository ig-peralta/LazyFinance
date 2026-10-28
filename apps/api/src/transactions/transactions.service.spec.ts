import type { TransactionRepository } from '../drizzle/repositories/transaction.repository';
import { describe, expect, it, vi } from 'vitest';
import { TransactionsService } from './transactions.service';

const userId = '00000000-0000-4000-8000-000000000001';
const firstId = '00000000-0000-4000-8000-000000000011';
const secondId = '00000000-0000-4000-8000-000000000012';

describe('TransactionsService', () => {
  it('assembles tagged and untagged movements with a singular nullable tag', async () => {
    const tag = { id: '00000000-0000-4000-8000-000000000032', name: 'Suscripciones', color: null };
    const rows = [
      {
        id: firstId,
        bookedAt: new Date('2026-10-15T15:00:00.000Z'),
        amount: '-49990.00',
        type: 'debit' as const,
        merchant: 'Netflix',
        description: null,
        accountId: '00000000-0000-4000-8000-000000000021',
        accountAlias: 'Tarjeta',
        accountType: 'credit_card' as const,
        currency: 'CLP' as const,
        tag,
        tagDecisionOrigin: 'manual' as const, tagRuleId: null, reviewStatus: 'clear' as const,
      },
      {
        id: secondId,
        bookedAt: new Date('2026-10-14T15:00:00.000Z'),
        amount: '140000.00',
        type: 'credit' as const,
        merchant: null,
        description: 'Ahorro',
        accountId: '00000000-0000-4000-8000-000000000022',
        accountAlias: null,
        accountType: 'savings' as const,
        currency: 'CLP' as const,
        tag: null,
        tagDecisionOrigin: 'unreviewed' as const, tagRuleId: null, reviewStatus: 'clear' as const,
      },
    ];
    const listRecentForUser = vi.fn(async () => rows);
    const service = new TransactionsService({ listRecentForUser } as unknown as TransactionRepository);

    await expect(service.getRecentForUser(userId)).resolves.toEqual([
      {
        id: firstId,
        bookedAt: '2026-10-15T15:00:00.000Z',
        amount: '-49990.00',
        type: 'debit',
        merchant: 'Netflix',
        description: null,
        account: { id: rows[0].accountId, alias: 'Tarjeta', type: 'credit_card', currency: 'CLP' },
        tag,
        tagDecisionOrigin: 'manual', tagRuleId: null, reviewStatus: 'clear',
      },
      {
        id: secondId,
        bookedAt: '2026-10-14T15:00:00.000Z',
        amount: '140000.00',
        type: 'credit',
        merchant: null,
        description: 'Ahorro',
        account: { id: rows[1].accountId, alias: null, type: 'savings', currency: 'CLP' },
        tag: null,
        tagDecisionOrigin: 'unreviewed', tagRuleId: null, reviewStatus: 'clear',
      },
    ]);
    expect(listRecentForUser).toHaveBeenCalledWith(userId);
  });

  it('returns no movements for an empty history', async () => {
    const listRecentForUser = vi.fn(async () => []);
    const service = new TransactionsService({ listRecentForUser } as unknown as TransactionRepository);

    await expect(service.getRecentForUser(userId)).resolves.toEqual([]);
  });
});
