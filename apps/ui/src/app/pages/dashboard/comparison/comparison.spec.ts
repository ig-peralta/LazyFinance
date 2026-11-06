import { TransferState } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { afterEach, describe, expect, it } from "vitest";
import { emptyComparison, setupRpc } from "../../../../testing/rpc";
import { Comparison } from "./comparison";

describe("Comparison resource view", () => {
  afterEach(() => TestBed.resetTestingModule());
  it("compares spending for equivalent dates without displaying income or transferring private state", async () => {
    setupRpc(
      {
        "summaries.comparison": () => ({
          ...emptyComparison,
          partial: true,
          spending: {
            current: "500000.00",
            previous: "600000.00",
            change: "-100000.00",
          },
        }),
      },
      "server",
    );
    const fixture = TestBed.createComponent(Comparison);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;

    for (const value of [
      "septiembre de 2026",
      "agosto de 2026",
      "hasta hoy",
      "$100.000 menos",
      "$500.000",
      "$600.000",
    ])
      expect(text).toContain(value);

    expect(text).not.toContain("Ingresos");
    expect(TestBed.inject(TransferState).toJson()).toBe("{}");
  });
});
