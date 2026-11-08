import { santiagoTimestamp } from "../utils/santiago-time";

/** Preserve fractional precision when comparing stored instants to local bounds. */
export function objectiveLocalTime(value: string) {
  if (!value.includes("T")) return `${value}.000000`;

  const fraction = value.match(/\.(\d+)Z$/)?.[1] ?? "";
  return `${santiagoTimestamp(new Date(value))}.${fraction.padEnd(6, "0")}`;
}

export function compareObjectiveBoundaries(left: string, right: string) {
  const utcKey = (value: string) => {
    const [whole, fraction = ""] = value.slice(0, -1).split(".");
    return `${whole}.${fraction.padEnd(6, "0")}`;
  };
  // Stored instants must not be reordered by Santiago's repeated DST hour.
  const bothInstants = left.includes("T") && right.includes("T");
  const first = bothInstants ? utcKey(left) : objectiveLocalTime(left);
  const second = bothInstants ? utcKey(right) : objectiveLocalTime(right);
  return first < second ? -1 : first > second ? 1 : 0;
}
