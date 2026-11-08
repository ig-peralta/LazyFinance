import { sql } from "kysely";

/** The same normalized eligibility used by spending aggregates and evidence. */
export function eligibleSpending() {
  return sql<boolean>`m.type = 'debit' AND m.is_internal_movement = false
    AND m.review_status = 'clear' AND m.removed_at IS NULL`;
}
