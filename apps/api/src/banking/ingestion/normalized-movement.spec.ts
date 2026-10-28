import { describe, expect, it } from 'vitest';
import { bookingDate } from './normalized-movement';

describe('Santiago booking-day projection', () => {
  it.each([
    ['2026-01-10', '2026-01-10T15:00:00.000Z'],
    ['2026-06-01', '2026-06-01T16:00:00.000Z'],
    ['2026-04-05', '2026-04-05T16:00:00.000Z'],
    ['2026-09-06', '2026-09-06T15:00:00.000Z'],
  ])('keeps the actual Chilean calendar day at local noon: %s', (on, instant) => {
    const result = bookingDate({ precision: 'calendar_day', on, timeZone: 'America/Santiago' });
    expect(result.bookedOn).toBe(on);
    expect(result.bookedAt.toISOString()).toBe(instant);
  });

  it('keeps a real instant instead of manufacturing another booking time', () => {
    expect(bookingDate({ precision: 'instant', at: '2026-10-12T16:34:00.000Z' }))
      .toEqual({ bookedAt: new Date('2026-10-12T16:34:00.000Z'), bookedOn: null });
  });
});
