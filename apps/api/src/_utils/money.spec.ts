import { describe, expect, it } from 'vitest';
import { fromCents, toCents } from './money';

describe('money in integer cents', () => {
  it('preserves signs and precision for large financial values', () => {
    expect(toCents('-1234.50')).toBe(-123450n);
    expect(toCents('0')).toBe(0n);
    expect(fromCents(toCents('9999999999999.99') - toCents('0.01'))).toBe('9999999999999.98');
    expect(fromCents(-1n)).toBe('-0.01');
  });
});
