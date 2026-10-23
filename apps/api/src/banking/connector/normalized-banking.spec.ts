import { describe, expect, it } from 'vitest';
import { fromCents, toCents } from '../../_utils/money';
import type { BankingConnector } from './banking-connector';
import { correctionPage, expiredFailure, initialPage, removalPage, retryableFailure, revokedFailure, unknownBalancePage } from './fixtures/normalized-pages';
import { ConnectorResultSchema, NormalizedMovementSchema } from './normalized-banking.schema';

describe('provider-neutral banking connector contract', () => {
  it('accepts a partial history with independent reported balances and reconciled movement signs', () => {
    const page = ConnectorResultSchema.parse(initialPage);
    expect(page.kind).toBe('page');
    if (page.kind !== 'page') return;

    const startingBalances = new Map([
      ['checking-1', toCents('1000.00')],
      ['savings-1', toCents('100.00')],
      ['card-1', toCents('0.00')],
    ]);
    for (const movement of page.movements) {
      startingBalances.set(movement.accountExternalId,
        startingBalances.get(movement.accountExternalId)! + toCents(movement.amount));
    }

    expect(page.accounts.map((account) => [
      account.externalId, account.reportedBalance?.amount,
      fromCents(startingBalances.get(account.externalId)!),
      account.historyCoverage.completeness,
    ])).toEqual([
      ['checking-1', '1160.00', '1160.00', 'partial'],
      ['savings-1', '300.00', '300.00', 'partial'],
      ['card-1', '-40.00', '-40.00', 'partial'],
    ]);

    expect(page.movements.filter((movement) => movement.relatedMovement?.kind === 'transfer_pair')
      .reduce((total, movement) => total + toCents(movement.amount), 0n)).toBe(0n);
    expect(page.movements.filter((movement) => movement.relatedMovement?.kind === 'card_payment_pair')
      .reduce((total, movement) => total + toCents(movement.amount), 0n)).toBe(0n);
    expect(page.accounts[2].reportedBalance?.meaning).toBe('card_liability');
    expect(page.movements.find((movement) => movement.externalId === 'card-purchase-1')?.amount).toBe('-100.00');
    expect(page.movements.find((movement) => movement.externalId === 'refund-1')?.relatedMovement?.kind).toBe('reversal');
    expect(page.movements.find((movement) => movement.externalId === 'salary-1')?.amount).toBe('500.00');
    expect(page.movements.find((movement) => movement.externalId === 'salary-1')?.booked)
      .toEqual({ precision: 'calendar_day', on: '2026-10-10', timeZone: 'America/Santiago' });
  });

  it('keeps movement identity scoped to an account while allowing corrections and partial pages', () => {
    expect(ConnectorResultSchema.safeParse(initialPage).success).toBe(true);
    expect(ConnectorResultSchema.safeParse(correctionPage).success).toBe(true);
    expect(ConnectorResultSchema.safeParse(removalPage).success).toBe(true);

    const purchase = initialPage.movements[1];
    const corrected = correctionPage.movements[0];
    expect([corrected.accountExternalId, corrected.externalId])
      .toEqual([purchase.accountExternalId, purchase.externalId]);
    expect(corrected.amount).toBe('-120.00');
    expect(correctionPage.movements).toHaveLength(1);
    expect(initialPage.movements.filter((movement) => movement.externalId === 'transfer-leg')).toHaveLength(2);
    expect(initialPage.accounts[0].number).toBe(initialPage.accounts[2].number);
    expect(removalPage.removedMovements[0]).toMatchObject({
      accountExternalId: purchase.accountExternalId, externalId: purchase.externalId, reason: 'reversed',
    });

    expect(ConnectorResultSchema.safeParse({
      ...initialPage,
      movements: [...initialPage.movements, purchase],
    }).success).toBe(false);
    expect(ConnectorResultSchema.safeParse({
      ...initialPage,
      accounts: [...initialPage.accounts, initialPage.accounts[0]],
    }).success).toBe(false);
    expect(ConnectorResultSchema.safeParse({
      ...initialPage,
      removedMovements: [removalPage.removedMovements[0], removalPage.removedMovements[0]],
    }).success).toBe(false);
    expect(ConnectorResultSchema.safeParse({
      ...initialPage,
      removedMovements: removalPage.removedMovements,
    }).success).toBe(false);
  });

  it('parses a paged fake adapter and typed retry/credential outcomes without a provider SDK', async () => {
    const fake: BankingConnector = {
      provider: 'fixture',
      async fetchPage({ pageCursor }) {
        if (pageCursor === 'retry') return retryableFailure;
        if (pageCursor === 'expired') return expiredFailure;
        if (pageCursor === 'revoked') return revokedFailure;
        return pageCursor === null
          ? { ...initialPage, movements: initialPage.movements.slice(0, 4), complete: false, nextCursor: 'next', checkpoint: null }
          : { ...initialPage, accounts: [], movements: initialPage.movements.slice(4), complete: true, nextCursor: null };
      },
    };

    const input = { connectionId: 'owned-connection', checkpoint: null };
    const first = ConnectorResultSchema.parse(await fake.fetchPage({ ...input, pageCursor: null }));
    expect(first.kind).toBe('page');
    if (first.kind !== 'page') return;
    expect(first.complete).toBe(false);
    expect(first.checkpoint).toBeNull();
    const second = ConnectorResultSchema.parse(await fake.fetchPage({ ...input, pageCursor: first.nextCursor }));
    expect(second.kind).toBe('page');
    if (second.kind !== 'page') return;
    expect(second.complete).toBe(true);
    expect(second.checkpoint).toBe('through-2026-10-15');
    expect(first.movements.length + second.movements.length).toBe(initialPage.movements.length);

    expect(ConnectorResultSchema.parse(await fake.fetchPage({ ...input, pageCursor: 'retry' })))
      .toEqual(retryableFailure);
    expect(ConnectorResultSchema.parse(await fake.fetchPage({ ...input, pageCursor: 'expired' })).kind)
      .toBe('failure');
    expect(ConnectorResultSchema.parse(await fake.fetchPage({ ...input, pageCursor: 'revoked' })).kind)
      .toBe('failure');
  });

  it('rejects ambiguous identities, money, dates, provider balance meanings and user-owned fields', () => {
    const purchase = initialPage.movements[1];
    const checking = initialPage.accounts[0];

    for (const amount of ['0.00', '-0.00', '+100.00', '100', '01.00', '1.001']) {
      expect(NormalizedMovementSchema.safeParse({ ...purchase, amount }).success).toBe(false);
    }
    for (const booked of [
      { precision: 'calendar_day', on: '2026-02-30', timeZone: 'America/Santiago' },
      { precision: 'calendar_day', on: '2026-10-12', timeZone: 'UTC' },
      { precision: 'instant', at: '2026-10-12T16:00:00' },
    ]) {
      expect(NormalizedMovementSchema.safeParse({ ...purchase, booked }).success).toBe(false);
    }

    expect(NormalizedMovementSchema.safeParse({ ...purchase, externalId: '  ' }).success).toBe(false);
    expect(NormalizedMovementSchema.safeParse({ ...purchase, tagId: 'user-tag' }).success).toBe(false);
    expect(NormalizedMovementSchema.safeParse({ ...purchase, confirmedIncomeSourceId: 'source' }).success).toBe(false);
    expect(ConnectorResultSchema.safeParse({
      ...initialPage,
      accounts: [{ ...checking, reportedBalance: { ...checking.reportedBalance, meaning: 'card_liability' } }],
    }).success).toBe(false);
    expect(ConnectorResultSchema.safeParse({
      ...initialPage,
      accounts: [{ ...checking, currency: 'USD' }],
    }).success).toBe(false);
    expect(ConnectorResultSchema.safeParse({
      ...initialPage,
      accounts: [{ ...checking, historyCoverage: { completeness: 'complete', from: null, through: null } }],
    }).success).toBe(false);
    expect(ConnectorResultSchema.safeParse({ ...initialPage, complete: true, nextCursor: 'another-page' }).success).toBe(false);
    expect(ConnectorResultSchema.safeParse({
      ...initialPage, complete: false, nextCursor: 'another-page', checkpoint: 'uncommitted',
    }).success).toBe(false);
    expect(ConnectorResultSchema.safeParse({
      kind: 'failure', reason: 'expired', observedAt: initialPage.observedAt, retryAfter: '2026-10-18T19:00:00.000Z',
    }).success).toBe(false);
  });

  it('represents unknown balances, unknown history and retryable failures separately', () => {
    const page = ConnectorResultSchema.parse(unknownBalancePage);
    expect(page.kind).toBe('page');
    if (page.kind !== 'page') return;
    expect(page.accounts[0].reportedBalance).toBeNull();
    expect(page.accounts[0].historyCoverage.completeness).toBe('unknown');
    expect(ConnectorResultSchema.parse(retryableFailure)).toEqual(retryableFailure);
  });
});
