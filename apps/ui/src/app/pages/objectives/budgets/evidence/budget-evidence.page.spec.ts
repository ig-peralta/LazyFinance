import { TestBed } from "@angular/core/testing";
import { Router } from "@angular/router";
import { RouterTestingHarness } from "@angular/router/testing";
import { afterEach, describe, expect, it } from "vitest";
import {
  budgetDetail,
  budgetProgress,
  budgetRevision,
  movement,
  principal,
  type RpcOutput,
  setupRpc,
} from "../../../../../testing/rpc";
import { BudgetEvidencePage } from "./budget-evidence.page";

const evidence = {
  month: "2026-11",
  basis: "purchase_attribution",
  includesUntagged: false,
  totals: {
    count: 2,
    grossSpending: "150000.00",
    refunds: "20000.00",
    reimbursements: "10000.00",
    spending: "120000.00",
    unresolvedAdjustmentCount: 1,
  },
  untaggedInSelection: {
    count: 0,
    grossSpending: "0.00",
    refunds: "0.00",
    reimbursements: "0.00",
    spending: "0.00",
    unresolvedAdjustmentCount: 0,
  },
  tracking: {
    ...budgetProgress.tracking,
    asOf: budgetProgress.adjustmentsAsOf,
    adjustmentsAsOf: budgetProgress.adjustmentsAsOf,
    revisionId: budgetRevision.id,
  },
  items: [
    {
      ...movement,
      grossSpending: "130000.00",
      refunds: "20000.00",
      reimbursements: "10000.00",
      spending: "100000.00",
      unresolvedAdjustmentCount: 1,
    },
  ],
  pageInfo: { hasMore: true, nextCursor: "evidence-next" },
} satisfies RpcOutput<"objectives.budgetContributions">;

describe("budget contribution reconciliation", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("uses complete totals, retains observation cutoffs across pages and resets after selection/owner changes", async () => {
    const mock = setupRpc({
      "objectives.budgetContributions": (input, call) => ({
        ...evidence,
        items:
          call.authorization === "Bearer bob"
            ? []
            : [
                {
                  ...evidence.items[0],
                  merchant: input.cursor ? "Segunda compra" : "Primera compra",
                },
              ],
        pageInfo: input.cursor
          ? { hasMore: false, nextCursor: null }
          : evidence.pageInfo,
      }),
    });
    mock.navigate.mockRestore();
    TestBed.inject(Router).resetConfig([
      { path: "presupuestos/:id/movimientos", component: BudgetEvidencePage },
    ]);
    const path = `/presupuestos/${budgetDetail.id}/movimientos?revision=${budgetRevision.id}&month=2026-11&reported=120000.00`;
    const harness = await RouterTestingHarness.create(path);
    await harness.fixture.whenStable();
    harness.detectChanges();
    const root: HTMLElement = harness.fixture.nativeElement;
    expect(root.textContent).toContain("La selección concilia");
    expect(root.textContent).toContain("$120.000");
    expect(root.textContent).toContain(
      "no certifican que el historial bancario esté completo",
    );
    [...root.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("Siguiente"))
      ?.click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(
      mock.callsTo("objectives.budgetContributions").at(-1)?.input,
    ).toMatchObject({
      cursor: "evidence-next",
      asOf: evidence.tracking.asOf,
      adjustmentsAsOf: evidence.tracking.adjustmentsAsOf,
    });
    expect(root.textContent).toContain("Segunda compra");
    expect(root.textContent).toContain("$120.000");
    await harness.navigateByUrl(`${path}&asOf=2026-11-01T15:00:00.000Z`);
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(
      mock.callsTo("objectives.budgetContributions").at(-1)?.input.cursor,
    ).toBeUndefined();
    mock.credentials.accept({ ...principal, userId: "bob" }, "bob");
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(root.textContent).not.toContain("Primera compra");
    await harness.navigateByUrl(
      path.replace("reported=120000.00", "reported=999.00"),
    );
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(root.textContent).toContain("El total cambió");
  });

  it("does not turn an incomplete direct link into a broad unfiltered read", async () => {
    const mock = setupRpc();
    mock.navigate.mockRestore();
    TestBed.inject(Router).resetConfig([
      { path: "presupuestos/:id/movimientos", component: BudgetEvidencePage },
    ]);
    const harness = await RouterTestingHarness.create(
      `/presupuestos/${budgetDetail.id}/movimientos`,
    );
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(harness.fixture.nativeElement.textContent).toContain(
      "El enlace no contiene",
    );
    expect(mock.callsTo("objectives.budgetContributions")).toHaveLength(0);
  });
});
