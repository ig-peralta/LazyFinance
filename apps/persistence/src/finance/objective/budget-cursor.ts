import { CursorPageInputSchema } from "@lazyfinance/contracts";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

const BudgetCursorSchema = z.strictObject({
  version: z.literal(1),
  budgetId: z.uuid(),
  revision: z.number().int().positive(),
});

export function encodeBudgetCursor(budgetId: string, revision: number) {
  return Buffer.from(
    JSON.stringify({ version: 1, budgetId, revision }),
  ).toString("base64url");
}

export function decodeBudgetCursor(cursor: string, budgetId: string) {
  try {
    CursorPageInputSchema.shape.cursor.unwrap().parse(cursor);
    const bytes = Buffer.from(cursor, "base64url");
    if (bytes.toString("base64url") !== cursor)
      throw new Error("Invalid encoding");

    const boundary = BudgetCursorSchema.parse(
      JSON.parse(bytes.toString("utf8")),
    );
    if (boundary.budgetId !== budgetId) throw new Error("Budget changed");

    return boundary.revision;
  } catch {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Invalid budget history cursor; restart without a cursor",
    });
  }
}
