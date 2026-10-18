import { and, eq, gte, lt, sql } from 'drizzle-orm';
import { transaction } from '../schema/transaction.table';

export function nextMonth(month: string): string {
  const year = Number(month.slice(0, 4));
  const number = Number(month.slice(5, 7));
  return number === 12 ? `${year + 1}-01` : `${year}-${String(number + 1).padStart(2, '0')}`;
}

export function previousMonth(month: string): string {
  const year = Number(month.slice(0, 4));
  const number = Number(month.slice(5, 7));
  return number === 1 ? `${year - 1}-12` : `${year}-${String(number - 1).padStart(2, '0')}`;
}

export function monthBounds(month: string) {
  return { start: `${month}-01 00:00:00`, end: `${nextMonth(month)}-01 00:00:00` };
}

export function inSantiagoPeriod(start: string, end: string) {
  return and(
    gte(transaction.bookedAt, sql`(${start}::timestamp AT TIME ZONE 'America/Santiago')`),
    lt(transaction.bookedAt, sql`(${end}::timestamp AT TIME ZONE 'America/Santiago')`),
  );
}

// A movement between two accounts the same user owns (an internal transfer
// or a credit-card payment) is marked directly on the row when it is
// recorded — see transaction.isInternalMovement. This does not depend on
// any tag's name, which the user is free to rename or delete.
export function excludesInternalTransfers() {
  return eq(transaction.isInternalMovement, false);
}
