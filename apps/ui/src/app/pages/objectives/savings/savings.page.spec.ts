import { TestBed } from "@angular/core/testing";
import { Router } from "@angular/router";
import { RouterTestingHarness } from "@angular/router/testing";
import { afterEach, describe, expect, it } from "vitest";
import { savingsGoal, setupRpc } from "../../../../testing/rpc";
import { SavingsPage } from "./savings.page";

describe("savings overview", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("shows target-only rows without per-goal measurements and a fixed setup return", async () => {
    const mock = setupRpc({ "objectives.list": () => [savingsGoal] });
    mock.navigate.mockRestore();
    TestBed.inject(Router).resetConfig([
      { path: "metas", component: SavingsPage },
    ]);
    const harness = await RouterTestingHarness.create(
      "/metas?from=onboarding&returnUrl=https://example.com",
    );
    await harness.fixture.whenStable();
    harness.detectChanges();
    const root: HTMLElement = harness.fixture.nativeElement;
    expect(root.querySelector(".workflow-return")?.getAttribute("href")).toBe(
      "/comenzar",
    );
    expect(root.textContent).toContain(savingsGoal.name);
    expect(root.querySelector(".section-tabs")).toBeNull();
    expect(mock.callsTo("objectives.list")).toHaveLength(1);
    expect(mock.callsTo("objectives.savingsProgress")).toHaveLength(0);
    await harness.navigateByUrl("/metas?from=https://example.com");
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(root.querySelector(".workflow-return")).toBeNull();
  });
});
