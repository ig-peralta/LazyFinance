import type {
  MerchantSpendingFact,
  MovementAggregate,
  TaggedMovementAggregate,
} from "@lazyfinance/contracts/internal";
import { describe, expect, it, vi } from "vitest";
import { movementAggregate } from "../../tests/fixtures/movement-aggregate";
import type { RpcStubs } from "../../tests/fixtures/rpc-stubs";
import type { PersistenceClient } from "../persistence/persistence.client";
import { SpendingInsightsService } from "./spending-insights.service";

type TransactionsClient = RpcStubs<
  ReturnType<PersistenceClient["user"]>["transactions"]
>;
const now = new Date("2026-11-22T16:00:00.000Z");
const tagId = "00000000-0000-4000-8000-000000000031";

function group(update: Partial<MovementAggregate> = {}): MovementAggregate {
  return {
    ...movementAggregate(update),
    amount: "-80.00",
    type: "debit",
    count: 1,
    isInternalMovement: false,
    reviewStatus: "clear",
    hasReceipt: false,
    ...update,
  };
}
function tagged(
  update: Partial<TaggedMovementAggregate> = {},
): TaggedMovementAggregate {
  return { ...group(update), tag: null, ...update };
}
function merchant(
  month: string,
  name = "streamflix",
  amount = "-10.00",
): MerchantSpendingFact {
  return {
    merchant: name,
    month,
    amount,
    refundAmount: "0.00",
    reimbursementAmount: "0.00",
    count: 1,
  };
}
function setup() {
  const aggregates = vi.fn<TransactionsClient["aggregates"]["query"]>(
    async () => [],
  );
  const taggedAggregates = vi.fn<
    TransactionsClient["taggedAggregates"]["query"]
  >(async () => []);
  const merchantSpending = vi.fn<
    TransactionsClient["merchantSpending"]["query"]
  >(async () => []);
  const transactions = {
    aggregates: { query: aggregates },
    taggedAggregates: { query: taggedAggregates },
    merchantSpending: { query: merchantSpending },
  } satisfies Pick<
    TransactionsClient,
    "aggregates" | "taggedAggregates" | "merchantSpending"
  >;
  const persistence = { user: vi.fn(() => ({ transactions })) };
  return {
    service: new SpendingInsightsService(
      persistence as unknown as PersistenceClient,
    ),
    aggregates,
    taggedAggregates,
    merchantSpending,
    persistence,
  };
}

describe("bounded spending insight reads", () => {
  it("calculates confirmed income less purchase-attributed net spending without misclassifying credits", async () => {
    const { service, aggregates } = setup();
    aggregates.mockResolvedValue([
      group({ type: "credit", amount: "100.00", hasReceipt: true }),
      group({ type: "credit", amount: "20.00", unclassifiedCreditCount: 1 }),
      group({
        amount: "-80.00",
        refundAmount: "10.00",
        reimbursementAmount: "5.00",
      }),
      group({ amount: "-25.00", isInternalMovement: true }),
      group({ amount: "-12.00", reviewStatus: "needs_review" }),
    ]);
    await expect(
      service.difference("owner", "2026-09", now),
    ).resolves.toMatchObject({
      month: "2026-09",
      receivedIncome: "100.00",
      spending: "65.00",
      difference: "35.00",
      unclassifiedCredits: { amount: "20.00", count: 1 },
      unresolvedMovementCount: 1,
      basis: "confirmed_income_minus_recorded_spending",
    });
    expect(aggregates).toHaveBeenCalledWith({
      start: "2026-09-01 00:00:00",
      end: "2026-10-01 00:00:00",
      asOf: now.toISOString(),
      adjustmentsAsOf: now.toISOString(),
    });
  });

  it("uses exclusive Santiago days, refuses broad/future ranges and never pages history", async () => {
    const { service, aggregates } = setup();
    aggregates.mockResolvedValue([group({ amount: "-20.00" })]);
    await expect(
      service.range("owner", { from: "2026-09-10", before: "2026-09-12" }, now),
    ).resolves.toMatchObject({
      spending: "20.00",
      from: "2026-09-10",
      before: "2026-09-12",
    });
    expect(aggregates).toHaveBeenCalledWith(
      expect.objectContaining({
        start: "2026-09-10 00:00:00",
        end: "2026-09-12 00:00:00",
      }),
    );
    await expect(
      service.range("owner", { from: "2025-09-10", before: "2026-09-12" }, now),
    ).rejects.toThrow();
    await expect(
      service.range("owner", { from: "2026-12-01", before: "2026-12-02" }, now),
    ).rejects.toThrow();
  });

  it("uses exact tagged and untagged aggregates for bounded trend and variation", async () => {
    const { service, taggedAggregates } = setup();
    taggedAggregates.mockImplementation(async ({ start }) =>
      start.startsWith("2026-08")
        ? [
            tagged({
              amount: "-40.00",
              tag: { id: tagId, name: "Comida", color: null },
            }),
            tagged({ amount: "-5.00" }),
          ]
        : [
            tagged({
              amount: "-60.00",
              tag: { id: tagId, name: "Comida", color: null },
            }),
            tagged({ amount: "-15.00" }),
          ],
    );
    await expect(
      service.trend("owner", { through: "2026-09", months: 2, tagId }, now),
    ).resolves.toMatchObject({
      selection: "tag",
      average: "50.00",
      months: [
        { month: "2026-08", spending: "40.00", partial: false },
        { month: "2026-09", spending: "60.00", partial: false },
      ],
    });
    await expect(
      service.trend(
        "owner",
        { through: "2026-09", months: 2, tagId: null },
        now,
      ),
    ).resolves.toMatchObject({ selection: "untagged", average: "10.00" });
    const change = await service.variation("owner", "2026-09", now);
    expect(change.change).toBe("30.00");
    expect(change.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Comida", change: "20.00" }),
        expect.objectContaining({ name: "Sin etiqueta", change: "10.00" }),
      ]),
    );
  });

  it("returns full merchant totals beside a capped ranking and treats repetition only as a candidate", async () => {
    const { service, merchantSpending } = setup();
    merchantSpending.mockImplementation(async ({ start }) =>
      start.startsWith("2026-07")
        ? [
            merchant("2026-07"),
            merchant("2026-08", "streamflix", "-11.00"),
            merchant("2026-09"),
            merchant("2026-09", "shop", "-20.00"),
          ]
        : [
            {
              ...merchant("2026-09"),
              refundAmount: "2.00",
              reimbursementAmount: "1.00",
            },
            merchant("2026-09", "shop", "-20.00"),
            merchant("2026-09", "market", "-30.00"),
            ...Array.from({ length: 12 }, (_, index) =>
              merchant("2026-09", `other-${index}`, "-1.00"),
            ),
          ],
    );
    const result = await service.recurring(
      "owner",
      { through: "2026-09", months: 3 },
      now,
    );
    expect(result.candidates).toEqual([
      expect.objectContaining({
        merchant: "streamflix",
        observedMonths: 3,
        total: "31.00",
      }),
    ]);
    const spending = await service.merchant(
      "owner",
      { month: "2026-09", merchant: "STREAM" },
      now,
    );
    expect(merchantSpending).toHaveBeenLastCalledWith(
      expect.objectContaining({ start: "2026-09-01 00:00:00" }),
    );
    expect(spending.merchants).toEqual([
      {
        merchant: "streamflix",
        spending: "7.00",
        grossSpending: "10.00",
        refunds: "2.00",
        reimbursements: "1.00",
        count: 1,
      },
    ]);
    expect(spending.totals.spending).toBe("7.00");
    const all = await service.merchant("owner", { month: "2026-09" }, now);
    expect(all.merchants).toHaveLength(12);
    expect(all.merchantGroups).toBe(15);
    expect(all.totals.spending).toBe("69.00");
    expect(all.otherSpending).toBe("3.00");
  });

  it("does not infer subscriptions from double charges, irregular months or substantially changing amounts", async () => {
    const { service, merchantSpending } = setup();
    merchantSpending.mockResolvedValue([
      merchant("2026-07", "double"),
      { ...merchant("2026-08", "double"), count: 2 },
      merchant("2026-09", "double"),
      merchant("2026-07", "gap"),
      merchant("2026-09", "gap"),
      merchant("2026-07", "vary"),
      merchant("2026-08", "vary", "-10.00"),
      merchant("2026-09", "vary", "-20.00"),
    ]);
    await expect(
      service.recurring("owner", { through: "2026-09", months: 3 }, now),
    ).resolves.toMatchObject({ candidates: [], hasMore: false });
  });
});
