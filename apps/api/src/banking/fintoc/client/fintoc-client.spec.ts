import { describe, expect, it, vi } from "vitest";
import {
  fintocAdmission,
  fintocEnvironment,
  fintocIntent,
  fintocLink,
} from "../../../../tests/fixtures/banking/fintoc";
import { FintocClient } from "./fintoc-client";

describe("Fintoc aggregation-only transport", () => {
  it("creates test intents and exchanges/reads links without exposing credentials in configuration", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(Response.json(fintocIntent))
      .mockResolvedValueOnce(Response.json(fintocLink))
      .mockResolvedValueOnce(
        Response.json({ ...fintocLink, link_token: null }),
      );
    const client = new FintocClient(
      fintocEnvironment(),
      fetch,
      fintocAdmission(),
    );
    expect(client.configuration()).toEqual({
      enabled: true,
      automaticSyncEnabled: false,
      publicKey: "pk_test_fixture",
      mode: "test",
    });
    expect(await client.createIntent("individual")).toMatchObject({
      id: "li_fixture",
      mode: "test",
    });
    await client.exchange("li_fixture_exc_authorization");
    await client.link("link_fixture_token_private");
    expect(fetch.mock.calls[0][0]).toBe(
      "https://api.fintoc.com/v1/link_intents",
    );
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toEqual({
      country: "cl",
      holder_type: "individual",
      product: "movements",
    });
    expect(
      fetch.mock.calls.every(
        ([, options]) =>
          options?.redirect === "error" && options.cache === "no-store",
      ),
    ).toBe(true);
    expect(fetch.mock.calls[0][1]?.headers).toMatchObject({
      Authorization: "sk_test_fixture",
    });
  });

  it.each([
    204, 404,
  ])("reconciles provider deletion with HTTP %i without replaying a mutation automatically", async (status) => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () => new Response(null, { status }),
    );
    await new FintocClient(
      fintocEnvironment(),
      fetch,
      fintocAdmission(),
    ).disconnect("link_fixture");
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0][0]).toBe(
      "https://api.fintoc.com/v1/links/link_fixture",
    );
    expect(fetch.mock.calls[0][1]?.method).toBe("DELETE");
  });

  it.each([
    [401, "unavailable"],
    [403, "revoked"],
    [404, "revoked"],
    [429, "unavailable"],
    [500, "unavailable"],
  ])("maps link HTTP %i to %s without echoing upstream secrets", async (status, kind) => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json(
        { error: { message: "sensitive-link-token" } },
        { status: Number(status) },
      ),
    );
    const error = await new FintocClient(
      fintocEnvironment(),
      fetch,
      fintocAdmission(),
    )
      .link("token")
      .catch((error: unknown) => error);
    expect(error).toMatchObject({ kind });
    expect(String(error)).not.toContain("sensitive-link-token");
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("rejects malformed/oversized responses and redacts network exceptions containing request URLs", async () => {
    for (const fetch of [
      vi.fn<typeof globalThis.fetch>(async () =>
        Response.json({ ...fintocLink, institution: null }),
      ),
      vi.fn<typeof globalThis.fetch>(async () =>
        Response.json({ payload: "x".repeat(1024 * 1024) }),
      ),
      vi.fn<typeof globalThis.fetch>(async () => {
        throw new Error("request URL contains sensitive-link-token");
      }),
    ]) {
      const error = await new FintocClient(
        fintocEnvironment(),
        fetch,
        fintocAdmission(),
      )
        .link("sensitive-link-token")
        .catch((error: unknown) => error);
      expect(error).toMatchObject({ kind: "unavailable" });
      expect(String(error)).not.toContain("sensitive-link-token");
    }
  });

  it("propagates the whole-run cancellation signal and sanitizes aborted provider errors", async () => {
    const controller = new AbortController();
    let entered = () => {};
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const fetch = vi.fn<typeof globalThis.fetch>(async (_address, options) => {
      const signal = options?.signal;
      if (!signal) throw new Error("Missing fetch cancellation signal");
      entered();
      return new Promise<Response>((_resolve, reject) => {
        signal.addEventListener(
          "abort",
          () => reject(new Error("sensitive-link-token in aborted URL")),
          { once: true },
        );
      });
    });
    const pending = new FintocClient(
      fintocEnvironment(),
      fetch,
      fintocAdmission(),
    ).link("private-token", controller.signal);
    await started;
    controller.abort();
    const error: unknown = await pending.catch((error: unknown) => error);
    expect(error).toMatchObject({ kind: "unavailable" });
    expect(String(error)).not.toContain("sensitive-link-token");
    expect(fetch).toHaveBeenCalledOnce();
  });
});
