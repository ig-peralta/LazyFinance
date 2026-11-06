import { createHash } from "node:crypto";

export function fingerprint(value: unknown): string {
  const json = JSON.parse(JSON.stringify(value));
  const sort = (item: unknown): unknown =>
    Array.isArray(item)
      ? item.map(sort)
      : item !== null && typeof item === "object"
        ? Object.fromEntries(
            Object.entries(item)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([key, value]) => [key, sort(value)]),
          )
        : item;

  return createHash("sha256")
    .update(JSON.stringify(sort(json)))
    .digest("hex");
}
