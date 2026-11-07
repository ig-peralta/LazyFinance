import { TransferState } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  movement,
  rpcFailure,
  setupRpc,
  tag,
  transactionPage,
} from "../../../../testing/rpc";
import { TaggingData } from "../../../features/tagging/tagging.data";
import { Activity } from "./activity";

describe("Activity resource view", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("shows movements and reflects authoritative tag decisions without component event plumbing", async () => {
    const { callsTo } = setupRpc({
      "transactions.list": () => transactionPage([movement], "next-page"),
    });
    const fixture = TestBed.createComponent(Activity);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain("Mercado");
    expect(fixture.nativeElement.textContent).toContain(
      "14 de octubre de 2026",
    );
    expect(fixture.nativeElement.textContent).toContain("-$15.000");
    await TestBed.inject(TaggingData).choose(
      movement,
      tag,
      false,
      new AbortController().signal,
    );
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain("Comida");
    expect(callsTo("transactions.list")).toHaveLength(1);
    expect(callsTo("transactions.list")[0].input).toEqual({ limit: 10 });
    expect(callsTo("transactions.recent")).toHaveLength(0);
    expect(fixture.nativeElement.textContent).not.toContain("Cargar más");
  });

  it("renders empty state on the server without TransferState", async () => {
    setupRpc({}, "server");
    const fixture = TestBed.createComponent(Activity);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(
      "Todavía no hay movimientos",
    );
    expect(TestBed.inject(TransferState).toJson()).toBe("{}");
  });

  it("offers retry without interpreting transport errors in the component", async () => {
    setupRpc({
      "transactions.list": vi
        .fn()
        .mockReturnValueOnce(rpcFailure())
        .mockReturnValueOnce(transactionPage([movement])),
    });
    const fixture = TestBed.createComponent(Activity);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(
      "No pudimos cargar tus movimientos",
    );
    fixture.nativeElement
      .querySelector('[data-testid="retry-activity"]')
      .click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain("Mercado");
  });
});
