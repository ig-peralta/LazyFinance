import { describe, expect, it } from 'vitest';
import { buildLedger } from './ledger';
import { tags } from './catalog';
import { seedId } from './helpers';
import { accounts } from './profile';

const asOf = new Date('2026-10-15T20:00:00.000Z');

describe('Chilean demo ledger', () => {
  it('has a repeatable multi-year history without future or invalid transactions', () => {
    const entries = buildLedger(asOf);
    const months = new Set(entries.map(({ bookedAt }) => bookedAt.toISOString().slice(0, 7)));

    expect(months.size).toBeGreaterThanOrEqual(33);
    expect([...months].sort()[0]).toBe('2024-01');
    expect(new Set(entries.map(({ id }) => id)).size).toBe(entries.length);
    expect(buildLedger(asOf)).toEqual(entries);
    const tagIds = new Set(tags.map(({ key }) => seedId(`tag:${key}`)));

    for (const entry of entries) {
      expect(entry.bookedAt.getTime()).toBeLessThanOrEqual(asOf.getTime());
      expect(Number(entry.amount)).not.toBe(0);
      expect(entry.type).toBe(Number(entry.amount) < 0 ? 'debit' : 'credit');
      expect(entry.tagId === null || tagIds.has(entry.tagId)).toBe(true);
    }
  });

  it('uses primary categories and includes unclassified spending', () => {
    const entries = buildLedger(asOf);
    expect(entries.filter(({ merchant }) => merchant === 'Netflix')
      .every(({ tagId }) => tagId === seedId('tag:subscriptions'))).toBe(true);
    expect(entries.filter(({ merchant }) => merchant === 'Restaurante Barrio Italia')
      .every(({ tagId }) => tagId === seedId('tag:dining'))).toBe(true);
    expect(entries.some(({ merchant, tagId, amount }) =>
      merchant === 'Almuerzo en oficina' && tagId === null && Number(amount) < 0)).toBe(true);
  });

  it('balances savings transfers across accounts and includes seasonal variation', () => {
    const entries = buildLedger(asOf);
    const savingsDeposits = entries.filter(({ accountId, description }) =>
      accountId === accounts.savings.id && description === 'Abono desde cuenta corriente');
    const savingsWithdrawals = entries.filter(({ accountId, description }) =>
      accountId === accounts.checking.id && description === 'Transferencia a cuenta de ahorro');

    expect(savingsDeposits.length).toBeGreaterThanOrEqual(33);
    expect(savingsDeposits.length).toBe(savingsWithdrawals.length);
    for (const deposit of savingsDeposits) {
      expect(savingsWithdrawals.some((withdrawal) =>
        withdrawal.bookedAt.getTime() === deposit.bookedAt.getTime() &&
        Number(withdrawal.amount) === -Number(deposit.amount))).toBe(true);
    }

    const cardPayments = entries.filter(({ accountId, description }) =>
      accountId === accounts.creditCard.id && description === 'Pago recibido de cuenta corriente');
    const checkingPayments = entries.filter(({ accountId, description }) =>
      accountId === accounts.checking.id && description === 'Pago de tarjeta de crédito');
    expect(cardPayments.length).toBe(checkingPayments.length);
    for (const payment of cardPayments) {
      expect(checkingPayments.some((withdrawal) =>
        withdrawal.bookedAt.getTime() === payment.bookedAt.getTime() &&
        Number(withdrawal.amount) === -Number(payment.amount))).toBe(true);
    }

    const rent = entries.filter(({ merchant }) => merchant === 'Arriendo Ñuñoa');
    expect(Number(rent.find(({ bookedAt }) => bookedAt.getUTCFullYear() === 2026)!.amount))
      .toBeLessThan(Number(rent[0].amount));
    expect(entries.filter(({ merchant, bookedAt }) => merchant === 'Netflix' &&
      bookedAt.toISOString().startsWith('2025-11')).length).toBe(2);
  });
});
