import { createHash } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

const schema = z.strictObject({
  version: z.literal(1),
  selection: z.string().regex(/^[a-f0-9]{64}$/),
  bookedAt: z.iso
    .datetime({ precision: 6 })
    .refine((value) => !value.startsWith("0000-")),
  id: z.uuid(),
});
const key = (selection: string) =>
  createHash("sha256").update(selection).digest("hex");

export function encodeSelectionCursor(
  selection: string,
  bookedAt: string,
  id: string,
) {
  return Buffer.from(
    JSON.stringify({ version: 1, selection: key(selection), bookedAt, id }),
  ).toString("base64url");
}

export function decodeSelectionCursor(cursor: string, selection: string) {
  try {
    if (cursor.length > 2048) throw new Error("Oversized cursor");
    const bytes = Buffer.from(cursor, "base64url");
    if (bytes.toString("base64url") !== cursor)
      throw new Error("Invalid encoding");
    const boundary = schema.parse(JSON.parse(bytes.toString("utf8")));
    if (boundary.selection !== key(selection))
      throw new Error("Selection changed");
    return boundary;
  } catch {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Invalid cursor or changed selection; restart pagination",
    });
  }
}
