import { CursorPageInputSchema } from "@lazyfinance/contracts";
import {
  type TransactionCursor,
  TransactionCursorSchema,
} from "@lazyfinance/contracts/internal";
import { TRPCError } from "@trpc/server";

export function encodeTransactionCursor(
  boundary: Omit<TransactionCursor, "version">,
): string {
  return Buffer.from(JSON.stringify({ version: 1, ...boundary })).toString(
    "base64url",
  );
}

export function decodeTransactionCursor(cursor: string, accountId?: string) {
  try {
    CursorPageInputSchema.shape.cursor.unwrap().parse(cursor);
    const bytes = Buffer.from(cursor, "base64url");
    if (bytes.toString("base64url") !== cursor)
      throw new Error("Invalid encoding");

    const boundary = TransactionCursorSchema.parse(
      JSON.parse(bytes.toString("utf8")),
    );
    if (boundary.accountId !== (accountId ?? null))
      throw new Error("Cursor filters changed");

    return boundary;
  } catch {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Invalid transaction cursor; restart pagination",
    });
  }
}
