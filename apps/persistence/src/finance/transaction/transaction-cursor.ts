import type { TransactionsInput } from "@lazyfinance/contracts";
import {
  decodeSelectionCursor,
  encodeSelectionCursor,
} from "../../pagination/selection-cursor";

type Filters = Omit<TransactionsInput, "cursor" | "limit">;

function selection(input: Filters) {
  return JSON.stringify({
    history: 1,
    accountId: input.accountId ?? null,
    bookedFrom: input.bookedFrom ?? null,
    bookedBefore: input.bookedBefore ?? null,
    tagId: input.tagId === undefined ? "all" : input.tagId,
    type: input.type ?? null,
    isInternalMovement:
      input.isInternalMovement === undefined ? "all" : input.isInternalMovement,
    merchant: input.merchant ?? null,
  });
}

export function encodeTransactionCursor(
  boundary: { bookedAt: string; id: string },
  input: Filters = {},
): string {
  return encodeSelectionCursor(
    selection(input),
    boundary.bookedAt,
    boundary.id,
  );
}

export function decodeTransactionCursor(cursor: string, input: Filters = {}) {
  return decodeSelectionCursor(cursor, selection(input));
}
