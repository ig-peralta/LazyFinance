import {
  CursorPageInfoSchema,
  CursorPageInputSchema,
  cursorPageSchema,
  TransactionsInputSchema,
} from "@lazyfinance/contracts";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { toCursorPage } from "./cursor-page";

describe("shared cursor page contracts", () => {
  it("defaults the page size and lets domains extend a strict input", () => {
    expect(CursorPageInputSchema.parse({})).toEqual({ limit: 25 });
    expect(TransactionsInputSchema.parse({ limit: 100 })).toEqual({
      limit: 100,
    });
    expect(
      TransactionsInputSchema.safeParse({ userId: "foreign" }).success,
    ).toBe(false);
  });

  it.each([
    0,
    -1,
    1.5,
    101,
    NaN,
    Infinity,
    "10",
    null,
  ])("rejects an invalid page size: %s", (limit) => {
    expect(CursorPageInputSchema.safeParse({ limit }).success).toBe(false);
  });

  it.each([
    "",
    "x".repeat(2049),
    null,
  ])("rejects empty, oversized or null cursors", (cursor) => {
    expect(CursorPageInputSchema.safeParse({ cursor }).success).toBe(false);
  });

  it("validates item shapes, the output bound and consistent page metadata", () => {
    const schema = cursorPageSchema(z.object({ id: z.string() }));
    const pageInfo = { hasMore: false, nextCursor: null };
    expect(schema.parse({ items: [{ id: "one" }], pageInfo })).toEqual({
      items: [{ id: "one" }],
      pageInfo,
    });
    expect(schema.safeParse({ items: [{ id: 1 }], pageInfo }).success).toBe(
      false,
    );
    expect(
      schema.safeParse({
        items: Array.from({ length: 101 }, () => ({ id: "one" })),
        pageInfo,
      }).success,
    ).toBe(false);
    for (const invalid of [
      { hasMore: true, nextCursor: null },
      { hasMore: false, nextCursor: "cursor" },
    ])
      expect(CursorPageInfoSchema.safeParse(invalid).success).toBe(false);
  });
});

describe("toCursorPage", () => {
  it("uses the last returned item, not the lookahead, as the boundary", () => {
    const rows = [{ id: "c" }, { id: "b" }, { id: "a" }];
    const encode = vi.fn((item: (typeof rows)[number]) => item.id);
    expect(toCursorPage(rows, 2, encode)).toEqual({
      items: [{ id: "c" }, { id: "b" }],
      pageInfo: { hasMore: true, nextCursor: "b" },
    });
    expect(encode).toHaveBeenCalledExactlyOnceWith(rows[1]);
    expect(rows).toHaveLength(3);
  });

  it.each([
    { items: [] },
    { items: [{ id: "a" }] },
    { items: [{ id: "b" }, { id: "a" }] },
  ])("returns no continuation for an empty, partial or exactly full final page", ({
    items,
  }) => {
    const encode = vi.fn((item: { id: string }) => item.id);
    expect(toCursorPage(items, 2, encode)).toEqual({
      items,
      pageInfo: { hasMore: false, nextCursor: null },
    });
    expect(encode).not.toHaveBeenCalled();
  });

  it.each([
    0,
    -1,
    1.5,
    101,
    NaN,
    Infinity,
  ])("does not construct pages with an invalid size: %s", (limit) => {
    expect(() => toCursorPage([], limit, String)).toThrow(RangeError);
  });
});
