import type { BankingImportReport } from "@lazyfinance/contracts";
import { santiagoParts } from "../../../utils/santiago-time";

/** First import is explicitly partial: today and the preceding 89 Santiago
 * calendar days. UTC is used only for date arithmetic, never to shift bookings. */
export function fintocInitialHistoryWindow(
  now: Date,
): BankingImportReport["requestedHistory"] {
  const local = santiagoParts(now);
  const through = `${local.year}-${local.month}-${local.day}`;
  const start = new Date(`${through}T00:00:00.000Z`);
  start.setUTCDate(start.getUTCDate() - 89);
  return { from: start.toISOString().slice(0, 10), through };
}
