import { describe, expect, it } from 'vitest';
import { monthBounds, previousMonth } from './financial-filters';

describe('monthBounds', () => {
  it('uses half-open calendar months, including across the year boundary', () => {
    expect(monthBounds('2026-09')).toEqual({
      start: '2026-09-01 00:00:00', end: '2026-10-01 00:00:00',
    });
    expect(monthBounds('2026-12')).toEqual({
      start: '2026-12-01 00:00:00', end: '2027-01-01 00:00:00',
    });
    expect(previousMonth('2026-01')).toBe('2025-12');
  });
});
