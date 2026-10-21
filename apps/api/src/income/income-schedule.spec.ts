import { IncomeSourceInputSchema } from '@lazyfinance/contracts';
import { describe, expect, it } from 'vitest';
import type { IncomeSourceRow } from '../drizzle/schema/income-source.table';
import { expectedIncomeForMonth } from './income-schedule';

function source(update: Partial<IncomeSourceRow> = {}): IncomeSourceRow {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    userId: '00000000-0000-4000-8000-000000000002',
    name: 'Sueldo', currency: 'CLP', regularity: 'regular', amountKind: 'fixed', expectedAmount: '100000.00',
    schedule: { frequency: 'monthly', day: 25 }, startDate: '2024-01-01', endDate: null,
    archivedAt: null, createdAt: new Date('2024-01-01T15:00:00Z'), updatedAt: new Date('2024-01-01T15:00:00Z'),
    ...update,
  };
}

describe('income calendar', () => {
  it('distinguishes every two weeks from twice monthly using actual dates', () => {
    const fortnightly = expectedIncomeForMonth('2026-01', [source({
      schedule: { frequency: 'every_two_weeks', anchorDate: '2026-01-02' },
    })], []);
    const twiceMonthly = expectedIncomeForMonth('2026-01', [source({
      schedule: { frequency: 'twice_monthly', days: [15, 'last'] },
    })], []);
    expect(fortnightly.payments.map(({ date }) => date)).toEqual(['2026-01-02', '2026-01-16', '2026-01-30']);
    expect(fortnightly.totals.amount).toBe('300000.00');
    expect(twiceMonthly.payments.map(({ date }) => date)).toEqual(['2026-01-15', '2026-01-31']);
    expect(twiceMonthly.totals.amount).toBe('200000.00');
    const february = expectedIncomeForMonth('2026-02', [source({
      schedule: { frequency: 'twice_monthly', days: [15, 30] },
    })], []);
    expect(february.payments.map(({ date }) => date)).toEqual(['2026-02-15', '2026-02-28']);
  });

  it.each([
    ['2026-02', 31, '2026-02-28'],
    ['2024-02', 31, '2024-02-29'],
    ['2026-04', 'last', '2026-04-30'],
    ['2026-04', 31, '2026-04-30'],
  ] as const)('clamps monthly dates and honors leap years for %s', (month, day, expected) => {
    const result = expectedIncomeForMonth(month, [source({ schedule: { frequency: 'monthly', day } })], []);
    expect(result.payments.map(({ date }) => date)).toEqual([expected]);
  });

  it('keeps weekly calendar dates stable across the Santiago daylight-saving change', () => {
    const result = expectedIncomeForMonth('2026-09', [source({
      schedule: { frequency: 'weekly', anchorDate: '2026-09-04' },
    })], []);
    expect(result.payments.map(({ date }) => date)).toEqual(['2026-09-04', '2026-09-11', '2026-09-18', '2026-09-25']);
  });

  it('respects the anchor and inclusive effective dates', () => {
    const result = expectedIncomeForMonth('2026-01', [source({
      startDate: '2026-01-03', endDate: '2026-01-16',
      schedule: { frequency: 'weekly', anchorDate: '2026-01-09' },
    })], []);
    expect(result.payments.map(({ date }) => date)).toEqual(['2026-01-09', '2026-01-16']);
  });

  it('uses the local archive date to retain past expectations and stop future ones', () => {
    const result = expectedIncomeForMonth('2026-01', [source({
      archivedAt: new Date('2026-01-15T02:00:00Z'),
      schedule: { frequency: 'twice_monthly', days: [1, 15] },
    })], []);
    expect(result.payments.map(({ date }) => date)).toEqual(['2026-01-01']);
    expect(expectedIncomeForMonth('2026-02', [source({ archivedAt: new Date('2026-01-15T02:00:00Z') })], []).payments).toEqual([]);
  });

  it('reports unknown payments separately and labels known variable amounts as estimates', () => {
    const unknown = source({ expectedAmount: null, amountKind: 'variable' });
    const estimated = source({
      id: '00000000-0000-4000-8000-000000000003', amountKind: 'variable', expectedAmount: '20.02',
    });
    const exact = source({ id: '00000000-0000-4000-8000-000000000004', expectedAmount: '100.01' });
    const result = expectedIncomeForMonth('2026-01', [unknown, estimated, exact], []);
    expect(result.totals).toEqual({ amount: '120.03', estimatedAmount: '20.02', unknownAmountCount: 1, paymentCount: 3 });
    expect(result.payments.find(({ sourceId }) => sourceId === unknown.id)).toMatchObject({ amount: null, amountType: 'unknown' });
    expect(result.payments.find(({ sourceId }) => sourceId === estimated.id)?.amountType).toBe('estimated');
  });

  it('never projects an irregular source without an explicit dated expectation', () => {
    const irregular = source({ regularity: 'irregular', schedule: null });
    expect(expectedIncomeForMonth('2026-01', [irregular], []).totals).toEqual({
      amount: '0.00', estimatedAmount: '0.00', unknownAmountCount: 0, paymentCount: 0,
    });
    const result = expectedIncomeForMonth('2026-01', [irregular], [{
      id: '00000000-0000-4000-8000-000000000005', sourceId: irregular.id,
      date: '2026-01-21', amount: '150000.00', isEstimate: true,
    }]);
    expect(result.payments).toHaveLength(1);
    expect(result.totals.amount).toBe('150000.00');
    expect(result.payments[0]).toMatchObject({ date: '2026-01-21', amountType: 'estimated' });
  });

  it('rejects declarations that cannot produce coherent payments', () => {
    const { id: _, userId: __, archivedAt: ___, createdAt: ____, updatedAt: _____, ...valid } = source();
    for (const invalid of [
      { ...valid, expectedAmount: '0.00' },
      { ...valid, expectedAmount: '-1.00' },
      { ...valid, expectedAmount: '1.001' },
      { ...valid, expectedAmount: null },
      { ...valid, schedule: null },
      { ...valid, regularity: 'irregular' },
      { ...valid, endDate: '2023-12-31' },
      { ...valid, startDate: '2026-02-30' },
      { ...valid, schedule: { frequency: 'weekly', anchorDate: '2026-02-30' } },
      { ...valid, schedule: { frequency: 'twice_monthly', days: [28, 'last'] } },
      { ...valid, schedule: { frequency: 'twice_monthly', days: [15, 15] } },
      { ...valid, userId: 'injected-owner' },
    ]) {
      expect(IncomeSourceInputSchema.safeParse(invalid).success, JSON.stringify(invalid)).toBe(false);
    }
    expect(IncomeSourceInputSchema.safeParse({
      ...valid, amountKind: 'variable', expectedAmount: null,
      schedule: { frequency: 'twice_monthly', days: [15, 30] },
    }).success).toBe(true);
  });
});
