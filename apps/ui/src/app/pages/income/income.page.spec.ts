import { TestBed } from "@angular/core/testing";
import {
  ActivatedRoute,
  convertToParamMap,
  type ParamMap,
  Router,
} from "@angular/router";
import { BehaviorSubject } from "rxjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDialogStub } from "../../../testing/dialog";
import { eventsIn } from "../../../testing/dom";
import {
  incomeSource,
  incomeSummary,
  setupRpc,
  transactionDetail,
} from "../../../testing/rpc";
import { currentMonth } from "../../../utils/month";
import { IncomePage } from "./income.page";

describe("income month navigation", () => {
  useDialogStub();
  afterEach(() => TestBed.resetTestingModule());

  function routeMonth(month: string) {
    const query = new BehaviorSubject<ParamMap>(convertToParamMap({ month }));
    Object.defineProperty(TestBed.inject(ActivatedRoute), "queryParamMap", {
      value: query,
    });
    return query;
  }

  it("reads and reacts to URL months, updates the URL on selection and does not reopen drafts", async () => {
    const mock = setupRpc({
      "transactions.detail": () => ({
        ...transactionDetail,
        type: "credit",
        amount: "1500000.00",
      }),
      "income.summary": ({ month }) => ({
        ...incomeSummary,
        month: month ?? incomeSummary.month,
        receipts: [
          {
            transactionId: transactionDetail.id,
            sourceId: incomeSource.id,
            sourceName: incomeSource.name,
            amount: "1500000.00",
            bookedAt: transactionDetail.bookedAt,
            confirmedAt: "2026-11-08T15:00:00.000Z",
          },
        ],
      }),
    });
    const query = routeMonth("2026-09");
    const navigate = vi
      .spyOn(TestBed.inject(Router), "navigate")
      .mockResolvedValue(true);
    const fixture = TestBed.createComponent(IncomePage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const picker = root.querySelector<HTMLInputElement>('input[type="month"]');
    if (!picker) throw new Error("Missing month selector");
    expect(picker.value).toBe("2026-09");
    expect(mock.callsTo("income.summary").at(-1)?.input).toEqual({
      month: "2026-09",
    });
    [...root.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("Reasignar o quitar"))
      ?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(root.querySelector("dialog")).not.toBeNull();
    picker.value = "2026-10";
    picker.dispatchEvent(eventsIn(root)("change"));
    expect(navigate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({
        queryParams: { month: "2026-10" },
        queryParamsHandling: "merge",
      }),
    );
    query.next(convertToParamMap({ month: "2026-10" }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(picker.value).toBe("2026-10");
    expect(mock.callsTo("income.summary").at(-1)?.input).toEqual({
      month: "2026-10",
    });
    expect(root.querySelector("dialog")).toBeNull();
    expect(root.querySelector("nav.section-tabs")).toBeNull();
    const review = [...root.querySelectorAll("h2")].findIndex(
      (heading) => heading.textContent === "Revisar abonos del mes",
    );
    const calendar = [...root.querySelectorAll("h2")].findIndex(
      (heading) => heading.textContent === "Tu calendario esperado",
    );
    expect(review).toBeGreaterThanOrEqual(0);
    expect(review).toBeLessThan(calendar);
    query.next(convertToParamMap({ month: "2026-09" }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(root.querySelector("dialog")).toBeNull();
  });

  it("does not send an invalid URL month to financial reads", async () => {
    const mock = setupRpc();
    routeMonth("2026-99");
    const fixture = TestBed.createComponent(IncomePage);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(mock.callsTo("income.summary").at(-1)?.input).toEqual({
      month: currentMonth(),
    });
  });
});
