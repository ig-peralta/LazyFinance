import { describe, expect, it } from "vitest";
import {
  decodeTransactionCursor,
  encodeTransactionCursor,
} from "./transaction-cursor";

const boundary = {
  id: "00000000-0000-4000-8000-000000000011",
  bookedAt: "2026-10-15T15:00:00.123456Z",
};

const encodeRaw = (value: unknown) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");

describe("transaction cursor", () => {
  it("round-trips both ordering keys without losing timestamp precision", () => {
    const cursor = encodeTransactionCursor(boundary);
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeTransactionCursor(cursor)).toMatchObject(boundary);
  });

  it("binds continuation to every normalized filter, but not page size", () => {
    const accountId = "00000000-0000-4000-8000-000000000021";
    const filters = {
      accountId,
      bookedFrom: "2026-09-01",
      bookedBefore: "2026-10-01",
      tagId: null,
      type: "debit" as const,
      isInternalMovement: false,
      merchant: "Store",
    };
    const cursor = encodeTransactionCursor(boundary, filters);
    expect(decodeTransactionCursor(cursor, filters)).toMatchObject(boundary);
    for (const changed of [
      {},
      { accountId: boundary.id },
      { bookedFrom: "2026-09-02" },
      { bookedBefore: "2026-10-02" },
      { tagId: boundary.id },
      { type: "credit" as const },
      { isInternalMovement: null },
      { merchant: "Other" },
    ])
      expect(() => decodeTransactionCursor(cursor, changed)).toThrow(
        /changed selection/,
      );
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
        message: "Invalid cursor or changed selection; restart pagination",
      }),
    );
  });
});
