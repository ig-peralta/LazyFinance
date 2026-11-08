import type { BankingImportReport } from "@lazyfinance/contracts";
import { santiagoParts } from "../../../utils/santiago-time";

function bookingDay(date: Date) {
  const { year, month, day } = santiagoParts(date);
  return `${year}-${month}-${day}`;
}

/** Current accounts, then booking days from this connection's first link onward.
 * Fintoc cannot reliably distinguish times within the same accounting day. */
export function fintocTrackingWindow(
  linkedAt: Date,
  now: Date,
): BankingImportReport["requestedHistory"] {
  const from = bookingDay(linkedAt),
    through = bookingDay(now);
  if (from > through)
    throw new RangeError("Connection linking day is in the future");
  return { from, through };
}
