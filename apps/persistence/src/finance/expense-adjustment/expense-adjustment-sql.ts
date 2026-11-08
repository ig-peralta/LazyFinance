import { sql } from "kysely";

function observationTime(asOf?: string) {
  return asOf ? sql`${asOf}::timestamptz` : sql`statement_timestamp()`;
}

/** Aliases x/p/c are the allocation, original purchase and credited movement. */
export function adjustmentIsValid(asOf?: string) {
  const observed = observationTime(asOf);
  return sql<boolean>`p.type = 'debit' AND c.type = 'credit'
    AND p.is_internal_movement = false AND c.is_internal_movement = false
    AND p.review_status = 'clear' AND c.review_status = 'clear'
    AND p.removed_at IS NULL AND c.removed_at IS NULL
    AND p.amount = x.purchase_amount AND c.amount = x.credit_amount
    AND p.booked_at = x.purchase_booked_at AND c.booked_at = x.credit_booked_at
    AND p.booked_at <= c.booked_at AND c.booked_at <= ${observed}
    AND NOT EXISTS (SELECT 1 FROM finance.income_receipt ir WHERE ir.transaction_id = c.id)
    AND (SELECT sum(a.amount) FROM finance.expense_adjustment a WHERE a.credit_transaction_id = c.id) <= c.amount
    AND (SELECT sum(a.amount) FROM finance.expense_adjustment a WHERE a.purchase_transaction_id = p.id) <= -p.amount`;
}

/** One row per purchase, never a flattened allocation join that multiplies gross spending. */
export function purchaseRecovery(asOf?: string) {
  const valid = sql<boolean>`coalesce((${adjustmentIsValid(asOf)}), false)`;
  return sql<{
    refundAmount: string;
    reimbursementAmount: string;
    adjustmentReviewCount: number;
  }>`(
    SELECT coalesce(sum(x.amount) FILTER (WHERE ${valid} AND x.kind = 'refund'),0)::text AS refund_amount,
      coalesce(sum(x.amount) FILTER (WHERE ${valid} AND x.kind = 'reimbursement'),0)::text AS reimbursement_amount,
      count(*) FILTER (WHERE NOT ${valid})::int AS adjustment_review_count
    FROM finance.expense_adjustment x
    JOIN finance.transaction p ON p.id = x.purchase_transaction_id
    JOIN finance.transaction c ON c.id = x.credit_transaction_id
    WHERE x.purchase_transaction_id = m.id AND x.confirmed_at <= ${observationTime(asOf)}
  )`;
}

/** Invalid allocations remain reserved, never quietly reclassified as earnings. */
export function creditRecovery(asOf?: string) {
  const valid = sql<boolean>`coalesce((${adjustmentIsValid(asOf)}), false)`;
  return sql<{
    reservedCreditAmount: string;
    expenseCreditAmount: string;
    adjustmentReviewCount: number;
  }>`(
    SELECT least(greatest(m.amount,0),coalesce(sum(x.amount),0))::text AS reserved_credit_amount,
      coalesce(sum(x.amount) FILTER (WHERE ${valid}),0)::text AS expense_credit_amount,
      count(*) FILTER (WHERE NOT ${valid})::int AS adjustment_review_count
    FROM finance.expense_adjustment x
    JOIN finance.transaction p ON p.id = x.purchase_transaction_id
    JOIN finance.transaction c ON c.id = x.credit_transaction_id
    WHERE x.credit_transaction_id = m.id AND x.confirmed_at <= ${observationTime(asOf)}
  )`;
}
