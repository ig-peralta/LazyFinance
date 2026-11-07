import { describe, expect, it } from "vitest";
import {
  decodeTransactionCursor,
  encodeTransactionCursor,
} from "./transaction-cursor";

const boundary = {
  id: "00000000-0000-4000-8000-000000000011",
  bookedAt: "2026-10-15T15:00:00.123456Z",
  accountId: null,
};

const encodeRaw = (value: unknown) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");

describe("transaction cursor", () => {
  it("round-trips both ordering keys without losing timestamp precision", () => {
    const cursor = encodeTransactionCursor(boundary);
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeTransactionCursor(cursor)).toEqual({
      version: 1,
      ...boundary,
    });
  });

  it("binds continuation to the original account filter", () => {
    const accountId = "00000000-0000-4000-8000-000000000021";
    const cursor = encodeTransactionCursor({ ...boundary, accountId });
    expect(decodeTransactionCursor(cursor, accountId).accountId).toBe(
      accountId,
    );
    for (const changed of [undefined, "00000000-0000-4000-8000-000000000022"])
      expect(() => decodeTransactionCursor(cursor, changed)).toThrow(
        "Invalid transaction cursor",
      );
    expect(() =>
      decodeTransactionCursor(encodeTransactionCursor(boundary), accountId),
    ).toThrow("Invalid transaction cursor");
  });

  it.each([
    "",
    "not a cursor!",
    "x".repeat(2049),
    Buffer.from("not json").toString("base64url"),
    `${encodeTransactionCursor(boundary)}=`,
    encodeRaw({ ...boundary, version: 2 }),
    encodeRaw({
      ...boundary,
      version: 1,
      bookedAt: "2026-02-30T00:00:00.000000Z",
    }),
    encodeRaw({
      ...boundary,
      version: 1,
      bookedAt: "2026-10-15T15:00:00.123Z",
    }),
    encodeRaw({
      ...boundary,
      version: 1,
      bookedAt: "0000-01-01T00:00:00.000000Z",
    }),
    encodeRaw({ ...boundary, version: 1, id: "not-a-uuid" }),
    encodeRaw({ ...boundary, version: 1, userId: boundary.id }),
    encodeRaw(null),
  ])("rejects malformed or unsupported cursors with a safe input error", (cursor) => {
    expect(() => decodeTransactionCursor(cursor)).toThrow(
      expect.objectContaining({
        code: "BAD_REQUEST",
        message: "Invalid transaction cursor; restart pagination",
      }),
    );
  });
});
