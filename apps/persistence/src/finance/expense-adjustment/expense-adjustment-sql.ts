import { type Kysely, sql } from "kysely";

function observationTime(asOf?: string) {
  return asOf ? sql`${asOf}::timestamptz` : sql`statement_timestamp()`;
}

/** Aliases x/p/c are the allocation, original purchase and credited movement. */
function adjustmentEligibility(
  asOf?: string,
  noReceipt = sql<boolean>`NOT EXISTS (SELECT 1 FROM finance.income_receipt ir WHERE ir.transaction_id = c.id)`,
) {
  const observed = observationTime(asOf);
  return sql<boolean>`p.type = 'debit' AND c.type = 'credit'
    AND p.is_internal_movement = false AND c.is_internal_movement = false
    AND p.review_status = 'clear' AND c.review_status = 'clear'
    AND p.removed_at IS NULL AND c.removed_at IS NULL
    AND p.amount = x.purchase_amount AND c.amount = x.credit_amount
    AND p.booked_at = x.purchase_booked_at AND c.booked_at = x.credit_booked_at
    AND p.booked_at <= c.booked_at AND c.booked_at <= ${observed}
    AND ${noReceipt}`;
}

export function adjustmentIsValid(asOf?: string) {
  return sql<boolean>`${adjustmentEligibility(asOf)}
    AND (SELECT sum(a.amount) FROM finance.expense_adjustment a WHERE a.credit_transaction_id = c.id) <= c.amount
    AND (SELECT sum(a.amount) FROM finance.expense_adjustment a WHERE a.purchase_transaction_id = p.id) <= -p.amount`;
}

type Allocation = {
  purchaseId: string;
  creditId: string;
  amount: string;
  kind: string;
  confirmedAt: Date;
  purchaseAmount: string;
  creditAmount: string;
  eligible: boolean;
};

/**
 * Materialize owned allocation facts once per statement, not once per movement.
 * Capacity includes every retained allocation, even beyond the observation cutoff.
 * Only the reported recoveries/reservations apply the confirmation cutoff.
 * Allocation RLS already requires both owned parents. Repeating an independent
 * account-owner join here underestimates their shared ownership and distorts joins.
 */
export function withExpenseRecoveries<DB>(db: Kysely<DB>, asOf?: string) {
  return db
    .with(
      (cte) => cte("recovery_allocations").materialized(),
      () => sql<Allocation>`(SELECT x.purchase_transaction_id AS purchase_id,
        x.credit_transaction_id AS credit_id, x.amount, x.kind, x.confirmed_at,
        p.amount AS purchase_amount, c.amount AS credit_amount,
        coalesce((${adjustmentEligibility(asOf, sql<boolean>`ir.transaction_id IS NULL`)}),false) AS eligible
        FROM finance.expense_adjustment x
        JOIN finance.transaction p ON p.id=x.purchase_transaction_id
        JOIN finance.transaction c ON c.id=x.credit_transaction_id
        LEFT JOIN finance.income_receipt ir ON ir.transaction_id=c.id)`,
    )
    .with(
      "recovery_credit_totals",
      () => sql<{
        creditId: string;
        amount: string;
      }>`(SELECT credit_id, sum(amount) AS amount
        FROM recovery_allocations GROUP BY credit_id)`,
    )
    .with(
      "recovery_purchase_totals",
      () => sql<{
        purchaseId: string;
        amount: string;
      }>`(SELECT purchase_id, sum(amount) AS amount
        FROM recovery_allocations GROUP BY purchase_id)`,
    )
    .with(
      (cte) => cte("recovery_facts").materialized(),
      () => sql<Allocation & { valid: boolean }>`(SELECT x.*,
        x.eligible AND ct.amount <= x.credit_amount AND pt.amount <= -x.purchase_amount AS valid
        FROM recovery_allocations x
        JOIN recovery_credit_totals ct ON ct.credit_id=x.credit_id
        JOIN recovery_purchase_totals pt ON pt.purchase_id=x.purchase_id
        WHERE x.confirmed_at <= ${observationTime(asOf)})`,
    )
    .with(
      "purchase_recoveries",
      () => sql<{
        transactionId: string;
        refundAmount: string;
        reimbursementAmount: string;
        adjustmentReviewCount: number;
      }>`(SELECT purchase_id AS transaction_id,
        coalesce(sum(amount) FILTER (WHERE valid AND kind='refund'),0)::text AS refund_amount,
        coalesce(sum(amount) FILTER (WHERE valid AND kind='reimbursement'),0)::text AS reimbursement_amount,
        count(*) FILTER (WHERE NOT valid)::int AS adjustment_review_count
        FROM recovery_facts GROUP BY purchase_id)`,
    )
    .with(
      "credit_recoveries",
      () => sql<{
        transactionId: string;
        reservedCreditAmount: string;
        expenseCreditAmount: string;
        adjustmentReviewCount: number;
      }>`(SELECT credit_id AS transaction_id,
        least(greatest(max(credit_amount),0),sum(amount))::text AS reserved_credit_amount,
        coalesce(sum(amount) FILTER (WHERE valid),0)::text AS expense_credit_amount,
        count(*) FILTER (WHERE NOT valid)::int AS adjustment_review_count
        FROM recovery_facts GROUP BY credit_id)`,
    );
}
