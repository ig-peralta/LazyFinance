import { describe, expect, it } from 'vitest';
import { santiagoMonth, santiagoTimestamp } from './santiago-time';

describe('Santiago calendar time', () => {
  it('keeps a late UTC hour in the correct local month', () => {
    expect(santiagoMonth(new Date('2026-11-01T02:30:00.000Z'))).toBe('2026-10');
    expect(santiagoMonth(new Date('2026-11-01T04:30:00.000Z'))).toBe('2026-11');
    expect(santiagoTimestamp(new Date('2026-10-16T15:30:45.000Z'))).toBe('2026-10-16 12:30:45');
  });
});
