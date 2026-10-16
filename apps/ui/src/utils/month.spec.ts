import { describe, expect, it } from 'vitest';
import { currentMonth, monthLabel } from './month';

describe('currentMonth', () => {
  it('uses Santiago calendar dates across UTC midnight and year boundaries', () => {
    expect(currentMonth(new Date('2026-10-16T15:00:00.000Z'))).toBe('2026-10');
    expect(currentMonth(new Date('2026-01-01T02:30:00.000Z'))).toBe('2025-12');
    expect(currentMonth(new Date('2026-01-01T04:30:00.000Z'))).toBe('2026-01');
    expect(monthLabel('2026-09')).toContain('septiembre');
  });
});
