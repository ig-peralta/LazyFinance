import { PLATFORM_ID } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type FintocFactory, FintocWidget } from "./fintoc-widget";

const options = {
  publicKey: "pk_test_ui_fixture",
  widgetToken: "li_ui_sec_fixture",
};

function setup(platform = "browser") {
  TestBed.configureTestingModule({
    providers: [{ provide: PLATFORM_ID, useValue: platform }],
  });
  const instance = { open: vi.fn(), destroy: vi.fn() };
  const factory = {
    create: vi.fn<FintocFactory["create"]>(() => instance),
  } satisfies FintocFactory;
  return { service: TestBed.inject(FintocWidget), factory, instance };
}

function script() {
  const node = document.querySelector<HTMLScriptElement>(
    "script[data-lazyfinance-fintoc]",
  );
  if (!node) throw new Error("Expected the explicit Fintoc script request");
  return node;
}

describe("explicit, browser-only Fintoc Widget lifetime", () => {
  afterEach(() => {
    for (const node of document.querySelectorAll(
      "script[data-lazyfinance-fintoc]",
    )) {
      node.dispatchEvent(new Event("error"));
      node.remove();
    }
    Reflect.deleteProperty(window, "Fintoc");
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  it("loads no third-party script on injection and never loads it on the server", async () => {
    const f = setup("server");
    expect(
      document.querySelector("script[data-lazyfinance-fintoc]"),
    ).toBeNull();
    await expect(
      f.service.authorize(options, new AbortController().signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(
      document.querySelector("script[data-lazyfinance-fintoc]"),
    ).toBeNull();
  });

  it("loads a fixed script only on authorization and accepts one callback without leaking provider payloads", async () => {
    const f = setup();
    expect(
      document.querySelector("script[data-lazyfinance-fintoc]"),
    ).toBeNull();
    const task = f.service.authorize(options, new AbortController().signal);
    expect(script().src).toBe("https://js.fintoc.com/v1/");
    expect(script().referrerPolicy).toBe("no-referrer");
    Reflect.set(window, "Fintoc", f.factory);
    script().dispatchEvent(new Event("load"));
    await vi.waitFor(() => expect(f.factory.create).toHaveBeenCalledOnce());
    expect(f.instance.open).toHaveBeenCalledOnce();
    const callbacks = f.factory.create.mock.calls[0][0];
    callbacks.onSuccess({
      exchangeToken: "li_ui_exc_valid",
      link: { sensitive: "not-consumed" },
    });
    callbacks.onSuccess({ exchangeToken: "li_ui_exc_duplicate" });
    callbacks.onExit();
    await expect(task).resolves.toBe("li_ui_exc_valid");
    expect(f.instance.destroy).toHaveBeenCalledOnce();
  });

  it("shares only script loading and never opens an obsolete user's Widget after a late load", async () => {
    const f = setup();
    const obsolete = new AbortController();
    const old = expect(
      f.service.authorize(options, obsolete.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    const current = f.service.authorize(options, new AbortController().signal);
    expect(
      document.querySelectorAll("script[data-lazyfinance-fintoc]"),
    ).toHaveLength(1);
    obsolete.abort();
    await old;
    Reflect.set(window, "Fintoc", f.factory);
    script().dispatchEvent(new Event("load"));
    await vi.waitFor(() => expect(f.factory.create).toHaveBeenCalledOnce());
    f.factory.create.mock.calls[0][0].onExit();
    await expect(current).resolves.toBeNull();
    expect(f.instance.destroy).toHaveBeenCalledOnce();
  });

  it("destroys an active Widget on cancellation and ignores a late provider success", async () => {
    const f = setup();
    Reflect.set(window, "Fintoc", f.factory);
    const controller = new AbortController();
    const task = expect(
      f.service.authorize(options, controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(f.factory.create).toHaveBeenCalledOnce());
    controller.abort();
    await task;
    f.factory.create.mock.calls[0][0].onSuccess({
      exchangeToken: "li_old_exc_late",
    });
    expect(f.instance.destroy).toHaveBeenCalledOnce();
  });

  it.each([
    null,
    {},
    { exchangeToken: 123 },
    { exchangeToken: "x".repeat(513) },
  ])("rejects malformed callback %j", async (payload) => {
    const f = setup();
    Reflect.set(window, "Fintoc", f.factory);
    const task = expect(
      f.service.authorize(options, new AbortController().signal),
    ).rejects.toThrow("invalid authorization");
    await vi.waitFor(() => expect(f.factory.create).toHaveBeenCalledOnce());
    f.factory.create.mock.calls[0][0].onSuccess(payload);
    await task;
    expect(f.instance.destroy).toHaveBeenCalledOnce();
  });

  it("allows an explicit retry after script failure without automatically opening another attempt", async () => {
    const f = setup();
    const first = expect(
      f.service.authorize(options, new AbortController().signal),
    ).rejects.toThrow("unavailable");
    script().dispatchEvent(new Event("error"));
    await first;
    expect(
      document.querySelector("script[data-lazyfinance-fintoc]"),
    ).toBeNull();
    const second = f.service.authorize(options, new AbortController().signal);
    Reflect.set(window, "Fintoc", f.factory);
    script().dispatchEvent(new Event("load"));
    await vi.waitFor(() => expect(f.factory.create).toHaveBeenCalledOnce());
    f.factory.create.mock.calls[0][0].onExit();
    await expect(second).resolves.toBeNull();
  });

  it("bounds script loading and does not retain a failed script", async () => {
    vi.useFakeTimers();
    const f = setup();
    const task = expect(
      f.service.authorize(options, new AbortController().signal),
    ).rejects.toThrow("unavailable");
    await vi.advanceTimersByTimeAsync(15_000);
    await task;
    expect(
      document.querySelector("script[data-lazyfinance-fintoc]"),
    ).toBeNull();
  });

  it("cleans up a synchronous provider callback without opening a settled Widget", async () => {
    const f = setup();
    f.factory.create.mockImplementation((callbacks) => {
      callbacks.onSuccess({ exchangeToken: "li_ui_exc_synchronous" });
      return f.instance;
    });
    Reflect.set(window, "Fintoc", f.factory);
    await expect(
      f.service.authorize(options, new AbortController().signal),
    ).resolves.toBe("li_ui_exc_synchronous");
    expect(f.instance.open).not.toHaveBeenCalled();
    expect(f.instance.destroy).toHaveBeenCalledOnce();
  });
});
