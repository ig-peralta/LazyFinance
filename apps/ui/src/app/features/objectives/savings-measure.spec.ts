import { TransferState } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  budgetDetail,
  budgetRevision,
  movement,
  rpcFailure,
  savingsGoal,
  savingsProgress,
  setupRpc,
  tag,
} from "../../../testing/rpc";
import { DashboardPage } from "../../pages/dashboard/dashboard.page";
import { TaggingData } from "../tagging/tagging.data";
import { SavingsMeasure } from "./savings-measure";

describe("backend-measured savings allocations", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("retains negative/over-target values, coverage uncertainty and pending evidence without summing pages", async () => {
    const mock = setupRpc({
      "objectives.savingsProgress": ({ month }) => ({
        ...savingsProgress,
        month: month ?? "2026-11",
        netContributions: "-100000.00",
        percentage: "-2.00",
        contributions: "0.00",
        withdrawals: "100000.00",
        remaining: "5100000.00",
      }),
      "objectives.savingsContributions": (input) => ({
        goalVersion: 1,
        tracking: savingsProgress.tracking,
        items: [
          {
            id: movement.id,
            bookedAt: movement.bookedAt,
            amount: "-100000.00",
            type: "debit",
            merchant: input.cursor ? "Segundo registro" : "Retiro registrado",
            description: null,
            tag,
            reviewStatus: "clear",
            accountId: movement.account.id,
            accountType: "checking",
            effect: input.cursor
              ? { status: "pending", reason: "movement_review" }
              : { status: "applied", kind: "withdrawal", amount: "-100000.00" },
          },
        ],
        pageInfo: {
          hasMore: !input.cursor,
          nextCursor: input.cursor ? null : "savings-next",
        },
      }),
    });
    const fixture = TestBed.createComponent(SavingsMeasure);
    fixture.componentRef.setInput("goal", savingsGoal);
    fixture.componentRef.setInput("month", "2026-11");
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    expect(root.textContent).toContain("-$100.000");
    expect(root.textContent).toContain("-2,00%");
    expect(root.textContent).toContain("$5.100.000");
    expect(root.textContent).toContain("Cobertura parcial o desconocida");
    expect(root.textContent).toContain("no se aplican como aportes");
    expect(root.querySelector<HTMLElement>(".progress-fill")?.style.width).toBe(
      "0%",
    );
    [...root.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("Ver aportes"))
      ?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    [...root.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("Siguiente"))
      ?.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(
      mock.callsTo("objectives.savingsContributions").at(-1)?.input,
    ).toMatchObject({
      cursor: "savings-next",
      asOf: savingsProgress.tracking.asOf,
    });
    expect(root.textContent).toContain("pendiente de revisión · no aplicado");
    fixture.componentRef.setInput("month", "2026-10");
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(
      mock.callsTo("objectives.savingsContributions").at(-1)?.input.cursor,
    ).toBeUndefined();
    expect(TestBed.inject(TransferState).toJson()).toBe("{}");
  });

  it("shows target-only on a failed/unsupported measurement, never a fabricated zero or percentage", async () => {
    setupRpc({
      "objectives.savingsProgress": vi
        .fn()
        .mockReturnValueOnce(rpcFailure())
        .mockReturnValueOnce({
          ...savingsProgress,
          netContributions: "6000000.00",
          percentage: "120.00",
          remaining: "-1000000.00",
        }),
    });
    const fixture = TestBed.createComponent(SavingsMeasure);
    fixture.componentRef.setInput("goal", savingsGoal);
    fixture.componentRef.setInput("month", "2026-11");
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    expect(root.textContent).toContain("Solo objetivo: $5.000.000");
    expect(root.textContent).not.toContain("0%");
    [...root.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("Reintentar"))
      ?.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(root.textContent).toContain("120,00%");
    expect(root.textContent).toContain("-$1.000.000");
    expect(root.querySelector<HTMLElement>(".progress-fill")?.style.width).toBe(
      "100%",
    );
  });

  it("measures only one featured dashboard goal and refreshes tag-dependent allocations after a decision", async () => {
    const mock = setupRpc({
      "objectives.list": () => [
        { ...budgetRevision, id: budgetDetail.id, intent: "spending" },
        savingsGoal,
        {
          ...savingsGoal,
          id: "00000000-0000-4000-8000-000000000079",
          name: "Otra meta",
        },
      ],
    });
    const fixture = TestBed.createComponent(DashboardPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(mock.callsTo("objectives.savingsProgress")).toHaveLength(1);
    expect(mock.callsTo("objectives.savingsProgress")[0].input.id).toBe(
      savingsGoal.id,
    );
    await fixture.componentRef.injector
      .get(TaggingData)
      .choose(movement, tag, false, new AbortController().signal);
    await fixture.whenStable();
    expect(mock.callsTo("objectives.savingsProgress")).toHaveLength(2);
    expect(mock.callsTo("accounts.list")).toHaveLength(1);
  });
});
