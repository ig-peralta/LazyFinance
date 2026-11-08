import { describe, expect, it } from "vitest";
import {
  fintocAccount,
  fintocMovement,
} from "../../../../tests/fixtures/banking/fintoc-snapshot";
import {
  NormalizedAccountSnapshotSchema,
  NormalizedMovementSchema,
} from "../../connector/normalized-banking.schema";
import {
  FintocAccountSchema,
  FintocMovementSchema,
} from "../client/fintoc-snapshot.schema";
import {
  normalizeFintocAccount,
  normalizeFintocMovement,
} from "./normalize-fintoc";

describe("Fintoc financial meanings", () => {
  it.each([
    ["checking_account", "checking"],
    ["sight_account", "checking"],
    ["rut_account", "checking"],
    ["savings_account", "savings"],
  ])("maps %s to %s using current, not available funds or credit", (raw, expected) => {
    const result = normalizeFintocAccount({ ...fintocAccount, type: raw });
    expect(result).toMatchObject({
      snapshot: {
        externalId: "acc_checking",
        type: expected,
        reportedBalance: {
          amount: "500000.00",
          meaning: "cash_balance",
          asOf: fintocAccount.refreshed_at,
        },
        historyCoverage: { completeness: "partial", from: null, through: null },
      },
    });
    if ("snapshot" in result)
      expect(
        NormalizedAccountSnapshotSchema.safeParse(result.snapshot).success,
      ).toBe(true);
  });

  it.each([
    0, -1, 9_999_999_999_999, -9_999_999_999_999,
  ])("keeps %s pesos exact including zero/negative cash", (current) => {
    expect(
      normalizeFintocAccount({ ...fintocAccount, balance: { current } }),
    ).toMatchObject({
      snapshot: { reportedBalance: { amount: `${current}.00` } },
    });
  });

  it("keeps unknown cash and source freshness unknown rather than synthesizing zero or fetch time", () => {
    expect(
      normalizeFintocAccount({ ...fintocAccount, balance: null }),
    ).toMatchObject({ snapshot: { reportedBalance: null } });
    expect(
      normalizeFintocAccount({ ...fintocAccount, balance: { current: null } }),
    ).toMatchObject({ snapshot: { reportedBalance: null } });
    expect(
      normalizeFintocAccount({ ...fintocAccount, refreshed_at: null }),
    ).toMatchObject({ snapshot: { reportedBalance: { asOf: null } } });
  });

  it("retains cards without converting remaining credit, limit or an unverified accounting sign into liability", () => {
    const result = normalizeFintocAccount({
      ...fintocAccount,
      type: "credit_card",
    });
    expect(result).toMatchObject({
      snapshot: { type: "credit_card", reportedBalance: null },
    });
  });

  it.each([
    [{ currency: "USD" }, "unsupported_currency"],
    [{ type: "line_of_credit" }, "unsupported_type"],
    [{ type: "future_product" }, "unsupported_type"],
    [{ removed_from_link: true }, "removed_from_link"],
  ])("reports an unsupported account explicitly", (change, reason) => {
    expect(normalizeFintocAccount({ ...fintocAccount, ...change })).toEqual({
      skipped: { externalId: "acc_checking", reason },
    });
  });

  it.each([
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
    10_000_000_000_000,
    "12",
    NaN,
    Infinity,
    undefined,
  ])("rejects invalid/unsafe supported cash %s", (current) => {
    expect(() =>
      normalizeFintocAccount({ ...fintocAccount, balance: { current } }),
    ).toThrow("Fintoc invalid_data");
  });

  it.each([
    "2026-01-01",
    "2026-04-05",
    "2026-09-06",
    "2026-11-01",
  ])("preserves %s as an accounting date, not a converted UTC instant", (day) => {
    const raw = FintocMovementSchema.parse({
      ...fintocMovement,
      post_date: `${day}T00:00:00.000Z`,
      transaction_date: "2026-10-31T23:00:00.000Z",
      merchant: "untrusted extra",
    });
    const result = normalizeFintocMovement("acc_checking", raw);
    expect(result.booked).toEqual({
      precision: "calendar_day",
      on: day,
      timeZone: "America/Santiago",
    });
    expect(result.merchant).toBeNull();
    expect(result.providerUpdatedAt).toBeNull();
    expect(NormalizedMovementSchema.safeParse(result).success).toBe(true);
  });

  it.each([
    "2026-02-30T00:00:00.000Z",
    "2026-11-01T01:00:00.000Z",
    "2026-11-01",
    "0000-01-01T00:00:00.000Z",
  ])("rejects a malformed post date %s", (post_date) => {
    expect(
      FintocMovementSchema.safeParse({ ...fintocMovement, post_date }).success,
    ).toBe(false);
  });

  it("retains debit/credit signs, opaque IDs and counterparty hints without claiming an owned pair or income", () => {
    const result = normalizeFintocMovement("acc_savings", {
      ...fintocMovement,
      amount: 1000,
      type: "transfer",
      sender_account: { holder_id: "12.345.678-5" },
    });
    expect(result).toMatchObject({
      externalId: "mov_purchase",
      amount: "1000.00",
      counterpartyHolder: { scheme: "cl_rut", value: "123456785" },
      relatedMovement: null,
      providerKind: "transfer",
      merchant: null,
    });
    expect(normalizeFintocMovement("acc_card", fintocMovement).amount).toBe(
      "-15000.00",
    );
  });

  it.each([
    0,
    1.5,
    10_000_000_000_000,
    Number.MAX_SAFE_INTEGER + 1,
  ])("rejects invalid booked amounts %s", (amount) => {
    const raw = FintocMovementSchema.safeParse({ ...fintocMovement, amount });
    if (raw.success)
      expect(() => normalizeFintocMovement("acc_checking", raw.data)).toThrow(
        "invalid_data",
      );
    else expect(raw.success).toBe(false);
  });

  it("requires stable IDs, explicit statuses and currency, but tolerates new irrelevant fields", () => {
    for (const change of [
      { id: "" },
      { status: undefined },
      { currency: "USD" },
    ])
      expect(
        FintocMovementSchema.safeParse({ ...fintocMovement, ...change })
          .success,
      ).toBe(false);
    expect(
      FintocAccountSchema.safeParse({ ...fintocAccount, extra: true }).success,
    ).toBe(true);
  });
});
