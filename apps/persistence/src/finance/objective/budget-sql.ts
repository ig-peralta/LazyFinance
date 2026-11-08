import { type Expression, sql } from "kysely";

/** Convert an API calendar boundary or an exact stored instant, without rounding. */
export function budgetInstant(value: string | Expression<string>) {
  return sql<Date>`CASE WHEN ${value}::text LIKE '%T%'
    THEN ${value}::timestamptz
    ELSE ${value}::timestamp AT TIME ZONE 'America/Santiago' END`;
}

/** pg Date values lose PostgreSQL microseconds; keep budget bounds exact on wire. */
export function budgetTimestamp<T extends Date | null>(value: Expression<T>) {
  return sql<
    T extends Date ? string : null
  >`to_char(${value} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
}
