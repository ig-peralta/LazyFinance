import { and, eq, gte, isNull, lt, sql } from 'drizzle-orm';
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

// Only booked, confirmed-external movements enter spending/income totals.
// Null internal status means unresolved, not confirmed external. A revoked
// provider movement keeps its row and user decisions but cannot count again.
export function excludesInternalTransfers() {
  return and(eq(transaction.isInternalMovement, false), eq(transaction.reviewStatus, 'clear'), isNull(transaction.removedAt));
}
