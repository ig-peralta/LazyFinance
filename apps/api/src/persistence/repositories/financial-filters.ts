import { and, eq, gte, isNull, lt, sql } from 'drizzle-orm';
import { transaction } from '../schema/transaction.table';
import { monthBounds } from '../../_utils/month';

export { monthBounds, nextMonth, previousMonth } from '../../_utils/month';

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
