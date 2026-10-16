import { and, gte, inArray, lt, not, sql } from 'drizzle-orm';
import { tag } from '../schema/tag.table';
import { transactionTag } from '../schema/transaction-tag.table';
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

// The demo data marks internal payments and savings transfers with these tags.
export function excludesInternalTransfers(userId: string) {
  return not(sql`EXISTS (
    SELECT 1 FROM ${transactionTag}
    INNER JOIN ${tag} ON ${transactionTag.tagId} = ${tag.id}
    WHERE ${transactionTag.transactionId} = ${transaction.id}
      AND ${tag.userId} = ${userId}
      AND ${inArray(tag.name, ['Transferencias', 'Ahorro'])}
  )`);
}
