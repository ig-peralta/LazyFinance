import { TestBed } from "@angular/core/testing";
import { afterEach, describe, expect, it } from "vitest";
import { deferred } from "../../../testing/deferred";
import { eventsIn } from "../../../testing/dom";
import {
  manualDecision,
  principal,
  type RpcOutput,
  setupRpc,
  tag,
  transactionDetail,
} from "../../../testing/rpc";
import { TransactionCorrections } from "./transaction-corrections";

describe("transaction corrections", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("uses separate tag, no-tag, reset and nullable classification commands without bank facts", async () => {
    const mock = setupRpc({
      "transactions.setInternalMovement": ({ id, isInternalMovement }) => ({
        id,
        isInternalMovement,
        userInternalOverride: isInternalMovement,
        providerInternalAssessment: "external",
        reviewStatus: "clear",
      }),
    });
    const fixture = TestBed.createComponent(TransactionCorrections);
    fixture.componentRef.setInput("item", transactionDetail);
    fixture.detectChanges();
    await fixture.whenStable();
    const root: HTMLElement = fixture.nativeElement;
    const event = eventsIn(root);
    const choose = (id: string, value: string) => {
      const select = root.querySelector<HTMLSelectElement>(id);
      if (!select) throw new Error(id);
      select.value = value;
      select.dispatchEvent(event("change"));
    };
    const submit = async (index: number) => {
      root
        .querySelectorAll("form")
        [index].dispatchEvent(
          event("submit", { bubbles: true, cancelable: true }),
        );
      await fixture.whenStable();
      fixture.detectChanges();
    };
    choose("#correction-tag", tag.id);
    await submit(0);
    expect(mock.callsTo("tags.decide")[0].input).toEqual({
      transactionId: transactionDetail.id,
      tagId: tag.id,
    });
    choose("#correction-tag", "none");
    await submit(0);
    expect(mock.callsTo("tags.decide")[1].input.tagId).toBeNull();
    [...root.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("Restablecer"))
      ?.click();
    await fixture.whenStable();
    expect(mock.callsTo("tags.reset")[0].input).toEqual({
      id: transactionDetail.id,
    });
    choose("#correction-internal", "internal");
    await submit(1);
    expect(mock.callsTo("transactions.setInternalMovement")[0].input).toEqual({
      id: transactionDetail.id,
      isInternalMovement: true,
    });
    choose("#correction-internal", "provider");
    await submit(1);
    expect(
      mock.callsTo("transactions.setInternalMovement")[1].input
        .isInternalMovement,
    ).toBeNull();
  });

  it("ignores a late owner result and prevents duplicate corrections", async () => {
    const save = deferred<RpcOutput<"tags.decide">>();
    const mock = setupRpc({ "tags.decide": () => save.promise });
    const fixture = TestBed.createComponent(TransactionCorrections);
    fixture.componentRef.setInput("item", transactionDetail);
    fixture.detectChanges();
    await fixture.whenStable();
    const emitted: string[] = [];
    fixture.componentInstance.saved.subscribe((message) =>
      emitted.push(message),
    );
    const form: HTMLFormElement = fixture.nativeElement.querySelector("form");
    const event = eventsIn(form);
    form.dispatchEvent(event("submit"));
    form.dispatchEvent(event("submit"));
    mock.credentials.accept({ ...principal, userId: "other" }, "bob");
    save.resolve(manualDecision());
    await fixture.whenStable();
    expect(mock.callsTo("tags.decide")).toHaveLength(1);
    expect(emitted).toEqual([]);
  });
});
