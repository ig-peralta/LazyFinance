import { TransferState } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deferred } from "../../../testing/deferred";
import { eventsIn } from "../../../testing/dom";
import {
  account,
  principal,
  type RpcHandlers,
  type RpcOutput,
  setupRpc,
} from "../../../testing/rpc";
import { AccountAliasEditor } from "./account-alias-editor";

const id = "00000000-0000-4000-8000-000000000201";
const otherId = "00000000-0000-4000-8000-000000000202";
const owned = (
  alias: string | null = null,
): RpcOutput<"accounts.list">[number] => ({ ...account(id), alias });
const button = (root: HTMLElement, text: string) => {
  const value = [...root.querySelectorAll("button")].find((item) =>
    item.textContent?.includes(text),
  );
  if (!value) throw new Error(`Missing button: ${text}`);
  return value;
};
const enter = (root: HTMLElement, value: string) => {
  const field = root.querySelector<HTMLInputElement>('input[name="alias"]');
  if (!field) throw new Error("Missing alias input");
  field.value = value;
  field.dispatchEvent(eventsIn(root)("input"));
};
const submit = (root: HTMLElement) =>
  root.querySelector("form")?.dispatchEvent(eventsIn(root)("submit"));
async function render(handlers: RpcHandlers = {}, initial = owned()) {
  const mock = setupRpc({
    "accounts.setAlias": ({ id, alias }) => ({ ...owned(alias), id }),
    ...handlers,
  });
  const fixture = TestBed.createComponent(AccountAliasEditor);
  fixture.componentRef.setInput("account", initial);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  const root: HTMLElement = fixture.nativeElement;
  return { mock, fixture, root };
}

describe("owned account alias editor", () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it.each([
    null,
    "Anterior",
  ])("creates or updates alias %j with trimmed input and emits saved without refreshing accounts", async (initial) => {
    const storage = vi.spyOn(Storage.prototype, "setItem");
    const { mock, fixture, root } = await render({}, owned(initial));
    expect(
      root.querySelector('.form-actions button[type="submit"]'),
    ).not.toBeNull();
    const saved = vi.fn();
    fixture.componentInstance.saved.subscribe(saved);
    expect(mock.calls).toEqual([]);
    enter(root, "  Nombre personal  ");
    submit(root);
    await fixture.whenStable();
    expect(mock.callsTo("accounts.setAlias").map((call) => call.input)).toEqual(
      [{ id, alias: "Nombre personal" }],
    );
    expect(saved).toHaveBeenCalledTimes(1);
    expect(mock.callsTo("accounts.list")).toHaveLength(0);
    expect(storage).not.toHaveBeenCalled();
    expect(TestBed.inject(TransferState).isEmpty).toBe(true);
  });

  it("clears only through the explicit null command, not a blank draft", async () => {
    const { mock, fixture, root } = await render({}, owned("Mi cuenta"));
    enter(root, "   ");
    submit(root);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(mock.callsTo("accounts.setAlias")).toHaveLength(0);
    expect(root.querySelector('[role="alert"]')?.textContent).toContain(
      "1 a 80",
    );
    button(root, "Quitar nombre personal").click();
    await fixture.whenStable();
    expect(mock.callsTo("accounts.setAlias").map((call) => call.input)).toEqual(
      [{ id, alias: null }],
    );
  });

  it.each([
    "",
    "   ",
    "a".repeat(81),
    "nombre\u0001oculto",
    "nombre\u202eoculto",
  ])("rejects invalid alias %j before sending a command", async (value) => {
    const { mock, fixture, root } = await render();
    enter(root, value);
    submit(root);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(mock.callsTo("accounts.setAlias")).toHaveLength(0);
    expect(root.querySelector('[role="alert"]')?.textContent).toContain(
      "sin saltos de línea ni caracteres de control",
    );
  });

  it("accepts the 80-character boundary after trimming and Unicode normalization", async () => {
    const { mock, fixture, root } = await render();
    enter(root, `  ${"a".repeat(79)}e\u0301  `);
    submit(root);
    await fixture.whenStable();
    expect(mock.callsTo("accounts.setAlias")[0].input).toEqual({
      id,
      alias: `${"a".repeat(79)}é`,
    });
  });

  it("prevents duplicate submits and clears while a save is pending; emits only once confirmed", async () => {
    const pending = deferred<RpcOutput<"accounts.setAlias">>();
    const { mock, fixture, root } = await render(
      { "accounts.setAlias": () => pending.promise },
      owned("Anterior"),
    );
    const saved = vi.fn();
    fixture.componentInstance.saved.subscribe(saved);
    enter(root, "Nuevo");
    submit(root);
    submit(root);
    button(root, "Quitar nombre personal").click();
    await vi.waitFor(() =>
      expect(mock.callsTo("accounts.setAlias")).toHaveLength(1),
    );
    fixture.detectChanges();
    expect(root.querySelector<HTMLInputElement>("input")?.disabled).toBe(true);
    expect(saved).not.toHaveBeenCalled();
    pending.resolve(owned("Nuevo"));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(saved).toHaveBeenCalledTimes(1);
    expect(mock.callsTo("accounts.setAlias")).toHaveLength(1);
  });

  it("locks an ambiguous result and asks its parent to reconcile without refreshing or repeating the write", async () => {
    const { mock, fixture, root } = await render(
      {
        "accounts.setAlias": () => {
          throw new Error("Lost response after possible commit");
        },
      },
      owned("Anterior"),
    );
    const saved = vi.fn(),
      reconcile = vi.fn();
    fixture.componentInstance.saved.subscribe(saved);
    fixture.componentInstance.reconcile.subscribe(reconcile);
    enter(root, "Nuevo");
    submit(root);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(root.textContent).toContain("El cambio puede haberse guardado");
    expect(root.querySelector<HTMLInputElement>("input")?.disabled).toBe(true);
    submit(root);
    submit(root);
    button(root, "Cerrar y consultar cuentas guardadas").click();
    await fixture.whenStable();
    expect(reconcile).toHaveBeenCalledTimes(1);
    expect(saved).not.toHaveBeenCalled();
    expect(mock.callsTo("accounts.setAlias")).toHaveLength(1);
    expect(mock.callsTo("accounts.list")).toHaveLength(0);
  });

  it.each([
    "owner",
    "account",
  ] as const)("resets the draft and aborts/ignores a late save after an %s change", async (changeScope) => {
    const pending = deferred<RpcOutput<"accounts.setAlias">>();
    const { mock, fixture, root } = await render(
      { "accounts.setAlias": () => pending.promise },
      owned("Anterior"),
    );
    const saved = vi.fn(),
      reconcile = vi.fn();
    fixture.componentInstance.saved.subscribe(saved);
    fixture.componentInstance.reconcile.subscribe(reconcile);
    enter(root, "Borrador privado");
    submit(root);
    await vi.waitFor(() =>
      expect(mock.callsTo("accounts.setAlias")).toHaveLength(1),
    );
    if (changeScope === "owner")
      mock.credentials.accept({ ...principal, userId: "owner-b" }, "bob");
    else
      fixture.componentRef.setInput("account", {
        ...owned("Otra cuenta"),
        id: otherId,
      });
    fixture.detectChanges();
    await vi.waitFor(() =>
      expect(
        mock.callsTo("accounts.setAlias")[0].options?.signal?.aborted,
      ).toBe(true),
    );
    pending.resolve(owned("Borrador privado"));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(root.querySelector<HTMLInputElement>("input")?.value).toBe(
      changeScope === "owner" ? "Anterior" : "Otra cuenta",
    );
    expect(root.querySelector<HTMLInputElement>("input")?.disabled).toBe(false);
    expect(root.textContent).not.toContain("El cambio puede haberse guardado");
    expect(saved).not.toHaveBeenCalled();
    expect(reconcile).not.toHaveBeenCalled();
    expect(mock.callsTo("accounts.setAlias")).toHaveLength(1);
  });
});
