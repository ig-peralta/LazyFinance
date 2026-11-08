import type {
  ProviderAccountRecord,
  TransactionRecord,
} from "@lazyfinance/contracts/internal";
import { describe, expect, it } from "vitest";
import { initialPage } from "../../tests/fixtures/banking/normalized-pages";
import { movementAggregate } from "../../tests/fixtures/movement-aggregate";
import {
  bookingDate,
  movementDirection,
} from "../banking/ingestion/normalized-movement";
import { movementTotals } from "../finance/movement-totals";
import { fromCents, toCents } from "../utils/money";
import { monthBounds } from "../utils/period";
import {
  type SavingsMovement,
  type SavingsWindow,
  savingsEffect,
} from "./savings-policy";

const goalTag = "goal-tag";
const window: SavingsWindow = {
  ...monthBounds("2026-11"),
  asOf: "2026-11-07T15:00:00.123456Z",
};

// Additional existing facts deliberately do not change savings eligibility.
type FixtureMovement = SavingsMovement &
  Pick<
    TransactionRecord,
    "id" | "accountId" | "isInternalMovement" | "providerKind" | "relationKind"
  > & { hasReceipt: boolean };

function movement(update: Partial<FixtureMovement> = {}): FixtureMovement {
  return {
    id: "movement",
    accountId: "checking",
    accountType: "checking",
    tagId: goalTag,
    bookedAt: "2026-11-02T15:00:00Z",
    amount: "100.00",
    type: "credit",
    isInternalMovement: false,
    reviewStatus: "clear",
    removedAt: null,
    providerKind: "other",
    relationKind: null,
    hasReceipt: false,
    ...update,
  };
}

// A fixture reconciliation, not an implementation that downloads bank history.
// LAZ-40 must read complete, owned SQL aggregates/evidence rather than browse pages.
function reconcile(
  rows: readonly SavingsMovement[],
  tags: readonly string[] = [goalTag],
  bounds: SavingsWindow = window,
) {
  const selected = new Set(tags);
  let contributions = 0n,
    withdrawals = 0n,
    pendingCount = 0;
  for (const row of rows) {
    const effect = savingsEffect(row, selected, bounds);
    if (effect.status === "pending") pendingCount++;
    if (effect.status !== "applied") continue;
    if (effect.kind === "contribution") contributions += toCents(effect.amount);
    else withdrawals -= toCents(effect.amount);
  }

  return {
    contributions: fromCents(contributions),
    withdrawals: fromCents(withdrawals),
    net: fromCents(contributions - withdrawals),
    pendingCount,
  };
}

describe("tag-driven savings contribution policy", () => {
  it("counts selected signed cash allocations without requiring a savings account", () => {
    const rows = [
      movement({ amount: "100.01" }),
      movement({
        accountId: "savings",
        accountType: "savings",
        amount: "-20.02",
        type: "debit",
      }),
      movement({ amount: "500.00", tagId: null }),
      movement({ amount: "500.00", tagId: "other-tag" }),
      movement({ amount: "500.00", accountType: "credit_card" }),
    ];
    const before = structuredClone(rows);
    expect(reconcile(rows)).toEqual({
      contributions: "100.01",
      withdrawals: "20.02",
      net: "79.99",
      pendingCount: 0,
    });
    expect(rows).toEqual(before);
    expect(savingsEffect(rows[2], new Set([goalTag]), window)).toEqual({
      status: "excluded",
      reason: "unselected_tag",
    });
    expect(savingsEffect(rows[4], new Set([goalTag]), window)).toEqual({
      status: "excluded",
      reason: "non_cash_account",
    });
  });

  it.each([
    true,
    false,
    null,
  ])("does not require transfer classification or income confirmation (%s)", (isInternalMovement) => {
    for (const hasReceipt of [true, false]) {
      const row = movement({
        isInternalMovement,
        hasReceipt,
        providerKind: "unknown",
      });
      expect(savingsEffect(row, new Set([goalTag]), window)).toEqual({
        status: "applied",
        kind: "contribution",
        amount: "100.00",
      });
    }
  });

  it("keeps an explicitly tagged movement pending for factual review without suppressing other amounts", () => {
    const rows = [
      movement(),
      movement({ reviewStatus: "needs_review", amount: "700.00" }),
      movement({ reviewStatus: "needs_review", tagId: "other-tag" }),
      movement({
        reviewStatus: "needs_review",
        removedAt: "2026-11-03T15:00:00Z",
      }),
    ];
    expect(savingsEffect(rows[1], new Set([goalTag]), window)).toEqual({
      status: "pending",
      reason: "movement_review",
    });
    expect(reconcile(rows)).toEqual({
      contributions: "100.00",
      withdrawals: "0.00",
      net: "100.00",
      pendingCount: 1,
    });
  });

  it("counts only a tagged transfer leg and nets same-goal transfers instead of summing absolute values", () => {
    const debit = movement({
      id: "source",
      amount: "-200.00",
      type: "debit",
      tagId: "transfer-tag",
      isInternalMovement: true,
      providerKind: "transfer",
      relationKind: "transfer_pair",
    });
    const credit = movement({
      id: "destination",
      accountId: "savings",
      accountType: "savings",
      amount: "200.00",
      isInternalMovement: true,
      providerKind: "transfer",
      relationKind: "transfer_pair",
    });
    expect(reconcile([debit, credit]).net).toBe("200.00");
    expect(reconcile([{ ...debit, tagId: goalTag }, credit])).toEqual({
      contributions: "200.00",
      withdrawals: "200.00",
      net: "0.00",
      pendingCount: 0,
    });
    expect(
      reconcile(
        [{ ...debit, tagId: goalTag }, credit],
        [goalTag, "transfer-tag"],
      ).net,
    ).toBe("0.00");
    // A move between two checking accounts uses exactly the same signed rule.
    expect(
      reconcile([
        { ...debit, tagId: goalTag },
        { ...credit, accountType: "checking" },
      ]).net,
    ).toBe("0.00");
  });

  it("does not create savings from the credit-card side of a tagged card payment", () => {
    const payment = movement({
      accountId: "checking",
      amount: "-60.00",
      type: "debit",
      isInternalMovement: true,
      providerKind: "card_payment",
      relationKind: "card_payment_pair",
    });
    const card = movement({
      accountId: "card",
      accountType: "credit_card",
      amount: "60.00",
      isInternalMovement: true,
      providerKind: "card_payment",
      relationKind: "card_payment_pair",
    });
    expect(reconcile([payment, card])).toEqual({
      contributions: "0.00",
      withdrawals: "60.00",
      net: "-60.00",
      pendingCount: 0,
    });
  });

  it("counts each selected movement once per goal and leaves shared-tag goals as overlapping views", () => {
    const rows = [movement({ id: "one" }), movement({ id: "two" })];
    expect(reconcile(rows, [goalTag, goalTag, "other-tag"]).net).toBe("200.00");
    expect(reconcile(rows, []).net).toBe("0.00");
    const emergency = reconcile(rows, [goalTag]);
    const trip = reconcile(rows, [goalTag, "trip-tag"]);
    expect(emergency.net).toBe("200.00");
    expect(trip.net).toBe("200.00");
    // Selecting the same tag for two goals does not reserve/duplicate bank cash.
    expect(rows.map(({ amount }) => amount)).toEqual(["100.00", "100.00"]);
  });

  it("uses live corrected facts, excludes retractions and applies a separately booked reversal only once", () => {
    const contribution = movement();
    const reversal = movement({
      id: "reversal",
      amount: "-100.00",
      type: "debit",
      providerKind: "reversal",
      relationKind: "reversal",
    });
    expect(reconcile([contribution, reversal])).toEqual({
      contributions: "100.00",
      withdrawals: "100.00",
      net: "0.00",
      pendingCount: 0,
    });
    expect(reconcile([{ ...contribution, amount: "120.00" }]).net).toBe(
      "120.00",
    );
    expect(
      reconcile([{ ...contribution, removedAt: "2026-11-03T15:00:00Z" }]).net,
    ).toBe("0.00");
    expect(
      savingsEffect(
        movement({ providerKind: "reversal", relationKind: "reversal" }),
        new Set([goalTag]),
        window,
      ).status,
    ).toBe("applied");
    // A provider hint cannot create an extra negative adjustment or rewrite dates.
    expect(reconcile([movement({ providerKind: "reversal" })]).net).toBe(
      "100.00",
    );
  });

  it("does not reuse original-purchase refund attribution for savings cash flows", () => {
    const purchase = movement({
      amount: "-100.00",
      type: "debit",
      bookedAt: "2026-10-15T15:00:00Z",
    });
    const refund = movement({
      amount: "30.00",
      providerKind: "reversal",
      relationKind: "reversal",
    });
    const october = { ...monthBounds("2026-10"), asOf: window.asOf };
    expect(reconcile([purchase, refund], [goalTag], october).net).toBe(
      "-100.00",
    );
    expect(reconcile([purchase, refund]).net).toBe("30.00");
    expect(
      reconcile([purchase, refund], [goalTag], {
        start: null,
        end: window.end,
        asOf: window.asOf,
      }).net,
    ).toBe("-70.00");
    expect(
      movementTotals([
        movementAggregate({
          type: "debit",
          amount: purchase.amount,
          refundAmount: refund.amount,
        }),
      ]).spending,
    ).toBe("70.00");
  });

  it("preserves exact cents and negative recorded net amounts without inventing an opening balance", () => {
    expect(
      reconcile([
        movement({ amount: "9007199254740.99" }),
        movement({ amount: "-9007199254740.98", type: "debit" }),
        movement({ amount: "0.02" }),
      ]),
    ).toEqual({
      contributions: "9007199254741.01",
      withdrawals: "9007199254740.98",
      net: "0.03",
      pendingCount: 0,
    });
    expect(reconcile([movement({ amount: "-50.00", type: "debit" })]).net).toBe(
      "-50.00",
    );
  });

  it("rejects broken normalized amount/direction invariants instead of reporting misleading contributions", () => {
    for (const row of [
      movement({ amount: "0.00" }),
      movement({ amount: "-1.00" }),
      movement({ type: "debit" }),
      movement({ amount: "1.001" }),
    ])
      expect(() => savingsEffect(row, new Set([goalTag]), window)).toThrow();
  });
});

describe("savings observation windows and available history", () => {
  it("uses half-open Santiago windows across DST and an inclusive exact observation instant", () => {
    const september = {
      ...monthBounds("2026-09"),
      asOf: "2026-10-15T15:00:00Z",
    };
    const selected = new Set([goalTag]);
    for (const [bookedAt, expected] of [
      ["2026-09-01T03:59:59.999999Z", "excluded"],
      ["2026-09-01T04:00:00.000000Z", "applied"],
      ["2026-10-01T02:59:59.999999Z", "applied"],
      ["2026-10-01T03:00:00.000000Z", "excluded"],
    ] as const)
      expect(
        savingsEffect(movement({ bookedAt }), selected, september).status,
        bookedAt,
      ).toBe(expected);
    for (const [bookedAt, expected] of [
      ["2026-11-07T15:00:00.123455Z", "applied"],
      [window.asOf, "applied"],
      ["2026-11-07T15:00:00.123457Z", "excluded"],
    ] as const)
      expect(
        savingsEffect(movement({ bookedAt }), selected, window).status,
        bookedAt,
      ).toBe(expected);
  });

  it("keeps lifetime goals cumulative while evaluating explicit monthly, yearly and fixed windows", () => {
    const rows = [
      movement({ bookedAt: "2025-12-15T15:00:00Z", amount: "40.00" }),
      movement({ bookedAt: "2026-09-15T15:00:00Z", amount: "100.00" }),
      movement({ amount: "-20.00", type: "debit" }),
    ];
    expect(reconcile(rows).net).toBe("-20.00");
    expect(
      reconcile(rows, [goalTag], { ...window, start: "2026-01-01 00:00:00" })
        .net,
    ).toBe("80.00");
    expect(reconcile(rows, [goalTag], { ...window, start: null }).net).toBe(
      "120.00",
    );
    const fixed = {
      start: "2026-09-15T15:00:00.000000Z",
      end: "2026-10-01T03:00:00.000000Z",
      asOf: window.asOf,
    };
    expect(reconcile(rows, [goalTag], fixed).net).toBe("100.00");
    // A closed fixed window remains measurable; selecting a later report does not erase it.
    expect(
      reconcile(rows, [goalTag], { ...fixed, asOf: "2027-01-15T15:00:00Z" })
        .net,
    ).toBe("100.00");
  });

  it("keeps same-goal cross-period transfer legs on their actual booking dates", () => {
    const debit = movement({
      amount: "-100.00",
      type: "debit",
      bookedAt: "2026-10-31T15:00:00Z",
      isInternalMovement: true,
    });
    const credit = movement({
      amount: "100.00",
      bookedAt: "2026-11-01T15:00:00Z",
      isInternalMovement: true,
    });
    expect(
      reconcile([debit, credit], [goalTag], {
        ...monthBounds("2026-10"),
        asOf: window.asOf,
      }).net,
    ).toBe("-100.00");
    expect(reconcile([debit, credit]).net).toBe("100.00");
    expect(
      reconcile([debit, credit], [goalTag], { ...window, start: null }).net,
    ).toBe("0.00");
  });

  it("retains temporal order inside the repeated Santiago hour", () => {
    const bounds = {
      start: "2026-04-05T02:50:00.000000Z",
      end: "2026-04-05T03:10:00.000000Z",
      asOf: window.asOf,
    };
    expect(
      reconcile(
        [
          movement({
            bookedAt: "2026-04-05T02:55:00.000000Z",
            amount: "10.01",
          }),
          movement({
            bookedAt: "2026-04-05T03:05:00.000000Z",
            amount: "20.02",
          }),
        ],
        [goalTag],
        bounds,
      ).net,
    ).toBe("30.03");
  });

  it("reconciles the existing partial normalized fixture without confusing an observed contribution with its bank balance", () => {
    const before = structuredClone(initialPage);
    const accounts = new Map(
      initialPage.accounts.map((account) => [account.externalId, account]),
    );
    const rows = initialPage.movements.map((item) => {
      const account = accounts.get(item.accountExternalId);
      if (!account) throw new Error("Missing fixture account");
      return movement({
        id: item.externalId,
        accountId: account.externalId,
        accountType: account.type,
        bookedAt: bookingDate(item.booked).bookedAt.toISOString(),
        amount: item.amount,
        type: movementDirection(item.amount),
        tagId: account.type === "savings" ? goalTag : null,
        isInternalMovement:
          item.relatedMovement?.kind === "transfer_pair" ? true : null,
        providerKind: item.providerKind,
        relationKind: item.relatedMovement?.kind ?? null,
      });
    });
    const bounds = { ...monthBounds("2026-10"), asOf: initialPage.observedAt };
    expect(reconcile(rows, [goalTag], bounds)).toEqual({
      contributions: "200.00",
      withdrawals: "0.00",
      net: "200.00",
      pendingCount: 0,
    });
    const account = accounts.get("savings-1");
    expect(account).toMatchObject({
      reportedBalance: { amount: "300.00" },
      historyCoverage: { completeness: "partial" },
    });
    expect(initialPage).toEqual(before);
    expect(
      movementTotals([
        movementAggregate({
          type: "debit",
          amount: "-200.00",
          isInternalMovement: true,
        }),
        movementAggregate({ amount: "200.00", isInternalMovement: true }),
      ]),
    ).toMatchObject({
      receivedIncome: "0.00",
      grossSpending: "0.00",
      spending: "0.00",
    });
  });

  it.each([
    "complete",
    "partial",
    "unknown",
  ] as const)("does not require %s history or an opening balance to interpret a known movement", (historyCompleteness) => {
    const account = {
      type: "checking",
      balance: "800000.00",
      historyCompleteness,
      historyFrom: historyCompleteness === "unknown" ? null : "2026-11-01",
      historyThrough: historyCompleteness === "unknown" ? null : "2026-11-07",
    } satisfies Pick<
      ProviderAccountRecord,
      | "type"
      | "balance"
      | "historyCompleteness"
      | "historyFrom"
      | "historyThrough"
    >;
    expect(
      reconcile([movement({ accountType: account.type, amount: "150.00" })])
        .net,
    ).toBe("150.00");
    expect(account.balance).toBe("800000.00");
    expect(account.historyCompleteness).toBe(historyCompleteness);
  });
});
