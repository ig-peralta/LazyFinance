import { SetAccountAliasSchema } from "@lazyfinance/contracts";
import { describe, expect, it } from "vitest";

const id = "00000000-0000-4000-8000-000000000001";

describe("account alias boundary", () => {
  it("normalizes a personal label and clears it only through explicit null", () => {
    expect(
      SetAccountAliasSchema.parse({ id, alias: "  Cafe\u0301 personal  " }),
    ).toEqual({ id, alias: "Café personal" });
    expect(SetAccountAliasSchema.parse({ id, alias: null })).toEqual({
      id,
      alias: null,
    });
    expect(
      SetAccountAliasSchema.safeParse({ id, alias: "a".repeat(80) }).success,
    ).toBe(true);
  });

  it.each([
    "",
    "   ",
    "a".repeat(81),
    "Cuenta\nsecreta",
    "Cuenta\n",
    "Cuenta\u0000",
    "Cuenta\u202e",
  ])("rejects blank, oversized or control-bearing label %j", (alias) => {
    expect(SetAccountAliasSchema.safeParse({ id, alias }).success).toBe(false);
  });

  it("rejects a client-proposed owner or missing target", () => {
    expect(
      SetAccountAliasSchema.safeParse({ id, alias: "Personal", userId: id })
        .success,
    ).toBe(false);
    expect(SetAccountAliasSchema.safeParse({ alias: "Personal" }).success).toBe(
      false,
    );
  });
});
