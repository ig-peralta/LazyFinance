import type { NewIncomeSourceRow } from '../schema';
import { seedId } from './helpers';
import type { LedgerEntry } from './ledger';
import { demoUser } from './profile';

export const incomeSources = [
  {
    id: seedId('income-source:salary'), name: 'Trabajo principal', userId: demoUser.id,
    currency: 'CLP', regularity: 'regular', amountKind: 'fixed', expectedAmount: '1750000.00',
    schedule: { frequency: 'monthly', day: 25 }, startDate: '2024-01-01',
  },
  {
    id: seedId('income-source:commissions'), name: 'Comisiones', userId: demoUser.id,
    currency: 'CLP', regularity: 'regular', amountKind: 'variable', expectedAmount: '120000.00',
    schedule: { frequency: 'monthly', day: 'last' }, startDate: '2026-01-01',
  },
  {
    id: seedId('income-source:freelance'), name: 'Proyectos independientes', userId: demoUser.id,
    currency: 'CLP', regularity: 'irregular', amountKind: 'variable', expectedAmount: null,
    schedule: null, startDate: '2024-01-01',
  },
  {
    id: seedId('income-source:bonuses'), name: 'Bonos y aguinaldos', userId: demoUser.id,
    currency: 'CLP', regularity: 'irregular', amountKind: 'variable', expectedAmount: null,
    schedule: null, startDate: '2024-01-01',
  },
] satisfies NewIncomeSourceRow[];

export const incomeExpectations = [
  { id: seedId('income-expectation:freelance-2024'), sourceId: seedId('income-source:freelance'), date: '2024-07-21', amount: '150000.00', isEstimate: false },
  { id: seedId('income-expectation:freelance-2026'), sourceId: seedId('income-source:freelance'), date: '2026-06-20', amount: '200000.00', isEstimate: true },
  ...[2024, 2025, 2026].map((year) => ({
    id: seedId(`income-expectation:bonus-${year}`), sourceId: seedId('income-source:bonuses'),
    date: `${year}-12-23`, amount: '160000.00', isEstimate: true,
  })),
];

export function buildIncomeReceipts(entries: LedgerEntry[]) {
  // Explicit declarations for the fabricated demo history, not a credit-detection rule.
  const sourceByDescription: Record<string, string> = {
    'Sueldo líquido mensual': 'salary',
    'Ingreso ocasional': 'freelance',
    'Aguinaldo de Navidad': 'bonuses',
  };
  return entries.flatMap((entry) => {
    const source = entry.description ? sourceByDescription[entry.description] : undefined;
    return source ? [{ transactionId: entry.id, sourceId: seedId(`income-source:${source}`), confirmedAt: entry.bookedAt }] : [];
  });
}
