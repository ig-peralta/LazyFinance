import { describe, expect, it } from 'vitest';
import { budgetPeriod } from './budget-period';

const monthly = {
  kind: 'time_based', intent: 'spending', isRecurring: true, period: 'monthly',
  startDate: new Date('2024-01-01T15:00:00.000Z'), endDate: null,
};

describe('budgetPeriod', () => {
  it('uses calendar months and year-to-date windows in Santiago', () => {
    expect(budgetPeriod(monthly, '2026-09')).toEqual({
      period: 'monthly', start: '2026-09-01 00:00:00', end: '2026-10-01 00:00:00',
    });
    expect(budgetPeriod({ ...monthly, period: 'yearly' }, '2026-09')).toEqual({
      period: 'yearly', start: '2026-01-01 00:00:00', end: '2026-10-01 00:00:00',
    });
  });

  it('caps a one-off target to its dates and skips an expired target or savings goal', () => {
    const fixed = {
      ...monthly, isRecurring: false, period: null,
      startDate: new Date('2025-09-01T15:00:00.000Z'),
      endDate: new Date('2025-10-01T15:00:00.000Z'),
    };
    expect(budgetPeriod(fixed, '2025-09')).toEqual({
      period: 'fixed', start: '2025-09-01 11:00:00', end: '2025-10-01 00:00:00',
    });
    expect(budgetPeriod(fixed, '2026-09')).toBeNull();
    expect(budgetPeriod({ ...monthly, intent: 'saving' }, '2026-09')).toBeNull();
    expect(budgetPeriod({ ...monthly, period: 'weekly' }, '2026-09')).toBeNull();
  });
});
