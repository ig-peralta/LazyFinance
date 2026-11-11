import type { MonthlySummary } from "@lazyfinance/contracts";
import { describe, expect, it } from "vitest";
import { emptySummary } from "../../../testing/rpc";
import { spendingDistribution } from "./spending-distribution";

function tag(id: string, amount: string): MonthlySummary["tags"][number] {
  return {
    id,
    name: id,
    color: "#000000",
    amount,
    grossAmount: amount,
    refunds: "0.00",
    reimbursements: "0.00",
    count: 1,
  };
}

describe("spending distribution presentation", () => {
  it("uses total net spending, including untagged purchases, rather than the largest tag", () => {
    const data = {
      ...emptySummary,
      spending: "20000.00",
      tags: [tag("Comida", "5000.00"), tag("Ocio", "10000.00")],
    };
    const chart = spendingDistribution(data);
    expect(
      chart.segments.map(({ name, width, offset, percentage }) => ({
        name,
        width,
        offset,
        percentage,
      })),
    ).toEqual([
      { name: "Ocio", width: 50, offset: 0, percentage: "50%" },
      { name: "Comida", width: 25, offset: 50, percentage: "25%" },
      { name: "Sin etiqueta", width: 25, offset: 75, percentage: "25%" },
    ]);
    expect(chart.untagged).toBe("5000.00");
    expect(data.tags.map(({ name }) => name)).toEqual(["Comida", "Ocio"]);
  });

  it("preserves huge exact totals and a one-cent remainder without financial Number conversions", () => {
    const chart = spendingDistribution({
      ...emptySummary,
      spending: "999999999999999999999.99",
      tags: [tag("Principal", "999999999999999999999.98")],
    });
    expect(chart.untagged).toBe("0.01");
    expect(chart.segments[1].amount).toBe("0.01");
    expect(chart.segments[1].percentage).toBe("<0,1%");
    expect(
      chart.segments.reduce((sum, segment) => sum + segment.width, 0),
    ).toBe(100);
  });

  it("groups the long tail without losing any exact amounts or zero-net recovered tags", () => {
    const chart = spendingDistribution({
      ...emptySummary,
      spending: "28.01",
      tags: [
        ...Array.from({ length: 7 }, (_, index) =>
          tag(`Tag ${index + 1}`, `${index + 1}.00`),
        ),
        tag("Recuperado", "0.00"),
      ],
    });
    expect(chart.grouped).toBe(true);
    expect(chart.segments).toHaveLength(7);
    expect(chart.segments.find(({ key }) => key === "other")?.amount).toBe(
      "3.00",
    );
    expect(chart.untagged).toBe("0.01");
    expect(chart.tags).toHaveLength(8);
    expect(chart.tags.at(-1)?.name).toBe("Recuperado");
    const last = chart.segments.at(-1);
    expect(last && last.offset + last.width).toBe(100);
  });

  it("closes the ring after cumulative rounding and orders ties by name", () => {
    const chart = spendingDistribution({
      ...emptySummary,
      spending: "0.03",
      tags: [tag("C", "0.01"), tag("A", "0.01"), tag("B", "0.01")],
    });
    expect(chart.segments.map(({ name }) => name)).toEqual(["A", "B", "C"]);
    expect(chart.segments[2].offset + chart.segments[2].width).toBe(100);
    expect(chart.segments.map(({ percentage }) => percentage)).toEqual([
      "33,3%",
      "33,3%",
      "33,3%",
    ]);
  });

  it("does not invent a distribution when spending is zero, negative or inconsistent", () => {
    expect(spendingDistribution(emptySummary).segments).toEqual([]);
    expect(
      spendingDistribution({
        ...emptySummary,
        tags: [tag("Recuperado", "0.00")],
      }).tags,
    ).toHaveLength(1);
    for (const data of [
      { ...emptySummary, spending: "-1.00" },
      { ...emptySummary, spending: "1.00", tags: [tag("Exceso", "2.00")] },
      { ...emptySummary, spending: "1.00", tags: [tag("Negativo", "-1.00")] },
    ]) {
      const chart = spendingDistribution(data);
      expect(chart.consistent).toBe(false);
      expect(chart.segments).toEqual([]);
      expect(chart.untagged).toBeNull();
    }
  });

  it("represents spending with no tags as entirely untagged", () => {
    const chart = spendingDistribution({ ...emptySummary, spending: "12.34" });
    expect(chart.segments).toMatchObject([
      { name: "Sin etiqueta", amount: "12.34", width: 100, percentage: "100%" },
    ]);
  });
});
