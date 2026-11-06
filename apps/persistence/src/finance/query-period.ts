import type { PeriodInput } from "@lazyfinance/contracts/internal";
import { sql } from "kysely";

/** All callers use the fixed movement alias m; values are always parameters. */
export function movementPeriod({ start, end, asOf }: PeriodInput) {
  return sql<boolean>`m.booked_at >= (${start}::timestamp AT TIME ZONE 'America/Santiago')
    AND m.booked_at < (${end}::timestamp AT TIME ZONE 'America/Santiago')
    ${asOf ? sql`AND m.booked_at <= ${new Date(asOf)}` : sql``}`;
}

export function wireValue(value: unknown): unknown {
  // pg numeric/int8 values are strings; only timestamps require JSON adaptation.
  return JSON.parse(JSON.stringify(value));
}
