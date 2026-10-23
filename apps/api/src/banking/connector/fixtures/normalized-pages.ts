import type { ConnectorFailure, ConnectorPage } from '../normalized-banking.schema';

// Partial imported history; these reported balances include earlier activity
// outside the window. The two owned-account pairs share movement IDs across
// accounts, and the refund is linked to (but separate from) the purchase.
export const initialPage = {
  kind: 'page',
  observedAt: '2026-10-15T18:00:00.000Z',
  complete: true,
  nextCursor: null,
  checkpoint: 'through-2026-10-15',
  accounts: [
    {
      externalId: 'checking-1',
      type: 'checking',
      currency: 'CLP',
      number: '****1234',
      holderName: null,
      reportedBalance: { amount: '1160.00', meaning: 'cash_balance', asOf: '2026-10-15T17:00:00.000Z' },
      historyCoverage: { completeness: 'partial', from: '2026-10-01', through: '2026-10-15' },
    },
    {
      externalId: 'savings-1',
      type: 'savings',
      currency: 'CLP',
      number: null,
      holderName: null,
      reportedBalance: { amount: '300.00', meaning: 'cash_balance', asOf: '2026-10-15T17:00:00.000Z' },
      historyCoverage: { completeness: 'partial', from: '2026-10-01', through: '2026-10-15' },
    },
    {
      externalId: 'card-1',
      type: 'credit_card',
      currency: 'CLP',
      number: '****1234',
      holderName: null,
      reportedBalance: { amount: '-40.00', meaning: 'card_liability', asOf: '2026-10-15T17:00:00.000Z' },
      historyCoverage: { completeness: 'partial', from: '2026-10-01', through: '2026-10-15' },
    },
  ],
  movements: [
    {
      accountExternalId: 'checking-1', externalId: 'salary-1',
      booked: { precision: 'calendar_day', on: '2026-10-10', timeZone: 'America/Santiago' },
      amount: '500.00', description: 'Deposit', merchant: null, providerUpdatedAt: null,
      providerKind: 'other', relatedMovement: null, counterpartyHolder: null,
    },
    {
      accountExternalId: 'checking-1', externalId: 'grocery-1',
      booked: { precision: 'instant', at: '2026-10-12T16:00:00.000Z' },
      amount: '-100.00', description: 'Groceries', merchant: 'Market', providerUpdatedAt: null,
      providerKind: 'other', relatedMovement: null, counterpartyHolder: null,
    },
    {
      accountExternalId: 'checking-1', externalId: 'transfer-leg',
      booked: { precision: 'calendar_day', on: '2026-10-13', timeZone: 'America/Santiago' },
      amount: '-200.00', description: 'Transfer to savings', merchant: null, providerUpdatedAt: null,
      providerKind: 'transfer',
      relatedMovement: { kind: 'transfer_pair', accountExternalId: 'savings-1', movementExternalId: 'transfer-leg' },
      counterpartyHolder: { scheme: 'test_owner_id', value: 'person-1' },
    },
    {
      accountExternalId: 'savings-1', externalId: 'transfer-leg',
      booked: { precision: 'calendar_day', on: '2026-10-13', timeZone: 'America/Santiago' },
      amount: '200.00', description: 'Transfer from checking', merchant: null, providerUpdatedAt: null,
      providerKind: 'transfer',
      relatedMovement: { kind: 'transfer_pair', accountExternalId: 'checking-1', movementExternalId: 'transfer-leg' },
      counterpartyHolder: { scheme: 'test_owner_id', value: 'person-1' },
    },
    {
      accountExternalId: 'card-1', externalId: 'card-purchase-1',
      booked: { precision: 'instant', at: '2026-10-13T19:30:00.000Z' },
      amount: '-100.00', description: 'Card purchase', merchant: 'Shop', providerUpdatedAt: null,
      providerKind: 'other', relatedMovement: null, counterpartyHolder: null,
    },
    {
      accountExternalId: 'checking-1', externalId: 'payment-leg',
      booked: { precision: 'calendar_day', on: '2026-10-14', timeZone: 'America/Santiago' },
      amount: '-60.00', description: 'Card payment', merchant: null, providerUpdatedAt: null,
      providerKind: 'card_payment',
      relatedMovement: { kind: 'card_payment_pair', accountExternalId: 'card-1', movementExternalId: 'payment-leg' },
      counterpartyHolder: null,
    },
    {
      accountExternalId: 'card-1', externalId: 'payment-leg',
      booked: { precision: 'calendar_day', on: '2026-10-14', timeZone: 'America/Santiago' },
      amount: '60.00', description: 'Card payment received', merchant: null, providerUpdatedAt: null,
      providerKind: 'card_payment',
      relatedMovement: { kind: 'card_payment_pair', accountExternalId: 'checking-1', movementExternalId: 'payment-leg' },
      counterpartyHolder: null,
    },
    {
      accountExternalId: 'checking-1', externalId: 'refund-1',
      booked: { precision: 'calendar_day', on: '2026-10-15', timeZone: 'America/Santiago' },
      amount: '20.00', description: 'Partial purchase reversal', merchant: 'Market', providerUpdatedAt: null,
      providerKind: 'reversal',
      relatedMovement: { kind: 'reversal', accountExternalId: 'checking-1', movementExternalId: 'grocery-1' },
      counterpartyHolder: null,
    },
  ],
  removedMovements: [],
} as const satisfies ConnectorPage;

// The same purchase gets a corrected provider amount and description, but its
// identity stays stable. The page's omission of other movements is not deletion.
export const correctionPage = {
  ...initialPage,
  observedAt: '2026-10-17T18:00:00.000Z',
  checkpoint: 'through-2026-10-17',
  accounts: [
    {
      ...initialPage.accounts[0],
      reportedBalance: { ...initialPage.accounts[0].reportedBalance, amount: '1140.00', asOf: '2026-10-17T17:00:00.000Z' },
    },
  ],
  movements: [
    {
      ...initialPage.movements[1],
      amount: '-120.00',
      description: 'Corrected groceries',
      providerUpdatedAt: '2026-10-16T12:00:00.000Z',
    },
  ],
} as const satisfies ConnectorPage;

// The provider withdraws an earlier confirmed item. Its identity is enough
// to remove it from financial totals without deleting the local record.
export const removalPage = {
  ...initialPage,
  observedAt: '2026-10-19T18:00:00.000Z',
  checkpoint: 'through-2026-10-19',
  accounts: [],
  movements: [],
  removedMovements: [{
    accountExternalId: 'checking-1', externalId: 'grocery-1',
    reason: 'reversed', providerUpdatedAt: '2026-10-19T16:00:00.000Z',
  }],
} as const satisfies ConnectorPage;

export const retryableFailure = {
  kind: 'failure',
  reason: 'retryable',
  observedAt: '2026-10-18T18:00:00.000Z',
  retryAfter: '2026-10-18T19:00:00.000Z',
} as const satisfies ConnectorFailure;

export const unknownBalancePage = {
  ...initialPage,
  accounts: [{
    ...initialPage.accounts[0],
    reportedBalance: null,
    historyCoverage: { completeness: 'unknown', from: null, through: null },
  }],
  movements: [],
  removedMovements: [],
  checkpoint: null,
} as const satisfies ConnectorPage;

export const expiredFailure = {
  kind: 'failure', reason: 'expired', observedAt: '2026-10-18T18:00:00.000Z', retryAfter: null,
} as const satisfies ConnectorFailure;

export const revokedFailure = {
  kind: 'failure', reason: 'revoked', observedAt: '2026-10-18T18:00:00.000Z', retryAfter: null,
} as const satisfies ConnectorFailure;
