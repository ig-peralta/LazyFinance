import type { NewAccountRow, NewUserRow } from '../schema';
import { seedId } from './helpers';

const joinedAt = new Date('2023-12-01T15:00:00.000Z');

export const demoUser = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'demo@lazyfinance.cl',
  name: 'Camila Rojas',
  createdAt: joinedAt,
} satisfies NewUserRow;

export const demoConnectionId = seedId('connection:manual');

export const accounts = {
  checking: {
    id: seedId('account:checking'),
    userId: demoUser.id,
    providerConnectionId: demoConnectionId,
    type: 'checking',
    number: 'DEMO-CC-001',
    holderName: demoUser.name,
    alias: 'Cuenta corriente',
    currency: 'CLP',
    createdAt: joinedAt,
  },
  savings: {
    id: seedId('account:savings'),
    userId: demoUser.id,
    providerConnectionId: demoConnectionId,
    type: 'savings',
    number: 'DEMO-AH-001',
    holderName: demoUser.name,
    alias: 'Fondo de emergencia',
    currency: 'CLP',
    createdAt: joinedAt,
  },
  creditCard: {
    id: seedId('account:credit-card'),
    userId: demoUser.id,
    providerConnectionId: demoConnectionId,
    type: 'credit_card',
    number: 'DEMO-TC-001',
    holderName: demoUser.name,
    alias: 'Tarjeta de crédito',
    currency: 'CLP',
    createdAt: joinedAt,
  },
} as const satisfies Record<string, NewAccountRow>;

export type AccountKey = keyof typeof accounts;

// Balances at the beginning of January 2024, before the first transaction.
export const openingBalances: Record<AccountKey, number> = {
  checking: 1_050_000,
  savings: 1_250_000,
  creditCard: 0,
};
