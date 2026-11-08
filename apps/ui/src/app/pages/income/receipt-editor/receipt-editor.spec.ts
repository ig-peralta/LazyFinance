import { TestBed } from "@angular/core/testing";
import { afterEach, describe, expect, it } from "vitest";
import { deferred } from "../../../../testing/deferred";
import { eventsIn } from "../../../../testing/dom";
import {
  incomeSource,
  incomeSummary,
  movement,
  principal,
  type RpcOutput,
  rpcResponse,
  setupRpc,
  transactionDetail,
  transactionPage,
} from "../../../../testing/rpc";
import { IncomePage } from "../income.page";
import { ReceiptEditor } from "./receipt-editor";

const credit = {
  ...transactionDetail,
  type: "credit" as const,
  amount: "1500000.00",
};
const receipt = {
  transactionId: credit.id,
  sourceId: incomeSource.id,
  sourceName: incomeSource.name,
  bookedAt: credit.bookedAt,
  amount: credit.amount,
  confirmedAt: "2026-11-08T15:00:00.000Z",
};

describe("received income decisions", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("confirms and reassigns an eligible credit and clears a retained ineligible receipt", async () => {
    let detail: RpcOutput<"transactions.detail"> = credit;
    const second = {
      ...incomeSource,
      id: "00000000-0000-4000-8000-000000000049",
      name: "Proyecto",
    };
    const mock = setupRpc({
      "transactions.detail": () => detail,
      "income.sources": () => [incomeSource, second],
      "income.confirm": ({ sourceId }) => {
        const sourceName =
          sourceId === second.id ? second.name : incomeSource.name;
        detail = {
          ...credit,
          receipt: { sourceId, sourceName },
        };
        return { ...receipt, sourceId, sourceName };
      },
      "income.clear": () => {
        detail = credit;
        return rpcResponse(undefined);
      },
    });
    const fixture = TestBed.createComponent(ReceiptEditor);
    fixture.componentRef.setInput("transactionId", credit.id);
    fixture.detectChanges();
    await fixture.whenStable();
    const root: HTMLElement = fixture.nativeElement;
    const event = eventsIn(root);
    const select = root.querySelector<HTMLSelectElement>("#receipt-source");
    if (!select) throw new Error("Missing source");
    select.value = incomeSource.id;
    select.dispatchEvent(event("change"));
    root.querySelector("form")?.dispatchEvent(event("submit"));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(mock.callsTo("income.confirm")[0].input).toEqual({
      transactionId: credit.id,
      sourceId: incomeSource.id,
    });
    fixture.destroy();
    const reassigned = TestBed.createComponent(ReceiptEditor);
    reassigned.componentRef.setInput("transactionId", credit.id);
    reassigned.detectChanges();
    await reassigned.whenStable();
    reassigned.detectChanges();
    const nextRoot: HTMLElement = reassigned.nativeElement;
    const nextEvent = eventsIn(nextRoot),
      nextSelect = nextRoot.querySelector<HTMLSelectElement>("#receipt-source");
    if (!nextSelect) throw new Error("Missing reassign source");
    expect(nextSelect.value).toBe(incomeSource.id);
    nextSelect.value = second.id;
    nextSelect.dispatchEvent(nextEvent("change"));
    nextRoot.querySelector("form")?.dispatchEvent(nextEvent("submit"));
    await reassigned.whenStable();
    expect(mock.callsTo("income.confirm")[1].input).toEqual({
      transactionId: credit.id,
      sourceId: second.id,
    });
    expect(detail.bookedAt).toBe(credit.bookedAt);
    expect(detail.amount).toBe(credit.amount);
    reassigned.destroy();
    detail = { ...detail, isInternalMovement: true };
    const retained = TestBed.createComponent(ReceiptEditor);
    retained.componentRef.setInput("transactionId", credit.id);
    retained.detectChanges();
    await retained.whenStable();
    retained.detectChanges();
    const retainedRoot: HTMLElement = retained.nativeElement;
    expect(retainedRoot.textContent).toContain("No se puede confirmar ahora");
    [...retainedRoot.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("Quitar vínculo"))
      ?.click();
    retained.detectChanges();
    [...retainedRoot.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("Sí, quitar"))
      ?.click();
    await retained.whenStable();
    expect(mock.callsTo("income.clear")).toHaveLength(1);
  });

  it.each([
    { isInternalMovement: null },
    { reviewStatus: "needs_review" as const },
    { removedAt: "2026-11-01T15:00:00.000Z" },
    { hasExpenseAdjustments: true },
    { type: "debit" as const },
  ])("does not offer confirmation for ineligible facts %j", async (facts) => {
    const mock = setupRpc({
      "transactions.detail": () => ({ ...credit, ...facts }),
      "income.sources": () => [incomeSource],
    });
    const fixture = TestBed.createComponent(ReceiptEditor);
    fixture.componentRef.setInput("transactionId", credit.id);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector("fieldset").disabled).toBe(true);
    expect(mock.callsTo("income.confirm")).toHaveLength(0);
  });

  it("keeps full-month plans, estimates, unknowns and receipts separate and reloads totals after a saved decision", async () => {
    let confirmed = false;
    const mock = setupRpc({
      "income.summary": () => ({
        ...incomeSummary,
        expectedIncome: {
          amount: "1700000.00",
          estimatedAmount: "200000.00",
          unknownAmountCount: 1,
          paymentCount: 3,
        },
        receivedIncome: confirmed ? credit.amount : "0.00",
        receipts: confirmed ? [receipt] : [],
      }),
      "transactions.list": () =>
        transactionPage([
          { ...movement, type: "credit", amount: credit.amount },
        ]),
      "transactions.detail": () => credit,
      "income.sources": () => [incomeSource],
      "income.confirm": () => {
        confirmed = true;
        return receipt;
      },
    });
    const fixture = TestBed.createComponent(IncomePage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const event = eventsIn(root);
    expect(root.textContent).toContain("$1.700.000");
    expect(root.textContent).toContain("$200.000 estimados");
    expect(root.textContent).toContain("1 montos desconocidos");
    [...root.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("Revisar este abono"))
      ?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const select = root.querySelector<HTMLSelectElement>("#receipt-source");
    if (!select) throw new Error("Missing receipt selector");
    select.value = incomeSource.id;
    select.dispatchEvent(event("change"));
    root.querySelector("form")?.dispatchEvent(event("submit"));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(mock.callsTo("income.summary")).toHaveLength(2);
    expect(root.textContent).toContain("Cobro confirmado");
    expect(root.textContent).toContain("$1.500.000");
  });

  it("prevents duplicate confirmation and ignores late results after an owner change", async () => {
    const pending = deferred<RpcOutput<"income.confirm">>();
    const mock = setupRpc({
      "transactions.detail": () => credit,
      "income.sources": () => [incomeSource],
      "income.confirm": () => pending.promise,
    });
    const fixture = TestBed.createComponent(ReceiptEditor);
    fixture.componentRef.setInput("transactionId", credit.id);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const emitted: string[] = [];
    fixture.componentInstance.saved.subscribe((message) =>
      emitted.push(message),
    );
    const root: HTMLElement = fixture.nativeElement,
      event = eventsIn(root),
      select = root.querySelector<HTMLSelectElement>("#receipt-source");
    if (!select) throw new Error("Missing selector");
    select.value = incomeSource.id;
    select.dispatchEvent(event("change"));
    root.querySelector("form")?.dispatchEvent(event("submit"));
    root.querySelector("form")?.dispatchEvent(event("submit"));
    mock.credentials.accept({ ...principal, userId: "bob" }, "bob");
    pending.resolve(receipt);
    await fixture.whenStable();
    expect(mock.callsTo("income.confirm")).toHaveLength(1);
    expect(emitted).toEqual([]);
  });
});
