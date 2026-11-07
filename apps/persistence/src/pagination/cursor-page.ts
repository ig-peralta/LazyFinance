import { MAX_CURSOR_PAGE_SIZE } from "@lazyfinance/contracts";

/** Rows must be ordered and include at most one lookahead beyond the page. */
export function toCursorPage<T>(
  rows: readonly T[],
  limit: number,
  encodeCursor: (item: T) => string,
) {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_CURSOR_PAGE_SIZE)
    throw new RangeError("Invalid cursor page size");

  const items = rows.slice(0, limit);
  const hasMore = rows.length > limit;

  return {
    items,
    pageInfo: {
      hasMore,
      nextCursor: hasMore ? encodeCursor(items[items.length - 1]) : null,
    },
  };
}
