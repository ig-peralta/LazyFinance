import type { PeriodInput } from "@lazyfinance/contracts/internal";
import { type Expression, sql } from "kysely";

/** All callers use the fixed movement alias m; values are always parameters. */
export function movementPeriod({
  start,
  end,
  asOf,
}: {
  start: string | Expression<string>;
  end: string | Expression<string>;
  asOf?: PeriodInput["asOf"];
}) {
  return sql<boolean>`m.booked_at >= (${start}::timestamp AT TIME ZONE 'America/Santiago')
    AND m.booked_at < (${end}::timestamp AT TIME ZONE 'America/Santiago')
    ${asOf ? sql`AND m.booked_at <= ${new Date(asOf)}` : sql``}`;
}
