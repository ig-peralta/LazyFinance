import { TestBed } from "@angular/core/testing";
import { Router } from "@angular/router";
import { RouterTestingHarness } from "@angular/router/testing";
import { afterEach, describe, expect, it } from "vitest";
import { eventsIn } from "../../../testing/dom";
import { setupRpc } from "../../../testing/rpc";
import { currentMonth } from "../../../utils/month";
import { ObjectivesPage } from "./objectives.page";

describe("budget month navigation", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("reads and updates the month without recreating the page, retaining fixed setup context", async () => {
    const mock = setupRpc();
    mock.navigate.mockRestore();
    const router = TestBed.inject(Router);
    router.resetConfig([
      { path: "presupuestos-y-metas", component: ObjectivesPage },
    ]);
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl(
      "/presupuestos-y-metas?month=2020-01&from=onboarding",
      ObjectivesPage,
    );
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(mock.callsTo("objectives.progress")[0].input).toMatchObject({
      month: "2020-01",
    });
    const root: HTMLElement = harness.fixture.nativeElement;
    expect(root.querySelector(".workflow-return")?.getAttribute("href")).toBe(
      "/comenzar",
    );
    expect(root.querySelector("details")?.open).toBe(false);
    expect(root.querySelector(".section-tabs")).toBeNull();
    const picker = root.querySelector<HTMLInputElement>('input[type="month"]');
    if (!picker) throw new Error("Missing month selector");
    picker.value = "2020-02";
    picker.dispatchEvent(eventsIn(root)("change"));
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(router.url).toContain("month=2020-02");
    expect(router.url).toContain("from=onboarding");
    expect(mock.callsTo("objectives.progress").at(-1)?.input).toMatchObject({
      month: "2020-02",
    });
    expect(
      await harness.navigateByUrl(
        "/presupuestos-y-metas?month=2020-03",
        ObjectivesPage,
      ),
    ).toBe(page);
    await harness.fixture.whenStable();
    expect(mock.callsTo("objectives.progress").at(-1)?.input).toMatchObject({
      month: "2020-03",
    });
  });

  it.each([
    "not-a-month",
    "2020-13",
    "9999-01",
    "",
  ])("safely falls back from %s", async (month) => {
    const mock = setupRpc();
    mock.navigate.mockRestore();
    TestBed.inject(Router).resetConfig([
      { path: "presupuestos-y-metas", component: ObjectivesPage },
    ]);
    const harness = await RouterTestingHarness.create(
      `/presupuestos-y-metas?month=${month}`,
    );
    await harness.fixture.whenStable();
    expect(mock.callsTo("objectives.progress")[0].input).toMatchObject({
      month: currentMonth(),
    });
  });
});
