import { santiagoParts } from "../utils/santiago-time";

/** Recorded account history covers the requested Santiago month through the observation day. */
export function coversObservedMonth(
  history:
    | {
        completeness: "complete" | "partial" | "unknown";
        from: string | null;
        through: string | null;
      }
    | undefined,
  month: string,
  asOf: string,
): boolean {
  if (history?.completeness !== "complete" || !history.from || !history.through)
    return false;

  const { year, month: currentMonth, day } = santiagoParts(new Date(asOf));
  const current = `${year}-${currentMonth}`;
  const lastDay = new Date(
    Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0),
  )
    .toISOString()
    .slice(0, 10);
  const requiredThrough = month === current ? `${current}-${day}` : lastDay;
  return history.from <= `${month}-01` && history.through >= requiredThrough;
}
