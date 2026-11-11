import { describe, expect, it, vi } from "vitest";
import {
  fintocAdmission,
  fintocEnvironment,
  fintocLink,
  storedLink,
} from "../../../../tests/fixtures/banking/fintoc";
import {
  fintocAccount,
  fintocHistoryWindow,
  fintocMovement,
} from "../../../../tests/fixtures/banking/fintoc-snapshot";
import {
  type ConnectorPage,
  ConnectorResultSchema,
} from "../../connector/normalized-banking.schema";
import { FintocClient } from "../client/fintoc-client";
import { FintocSnapshotConnector } from "./fintoc-snapshot.connector";

function setup(responses: Response[], selectedAccountIds = ["acc_checking"]) {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => {
    const response = responses.shift();
    if (!response) throw new Error("Unexpected upstream request");
    return response;
  });
  const connector = new FintocSnapshotConnector(
    new FintocClient(fintocEnvironment(), fetch, fintocAdmission()),
    storedLink,
    "link_fixture_token_private",
    fintocHistoryWindow,
    selectedAccountIds,
  );
  const input = {
    connectionId: storedLink.connection.id,
    checkpoint: null,
    pageCursor: null as string | null,
  };
  const next = async () => {
    const result = ConnectorResultSchema.parse(
      await connector.fetchPage(input),
    );
    if (result.kind === "page") input.pageCursor = result.nextCursor;
    return result;
  };
  const drain = async () => {
    const pages: ConnectorPage[] = [];
    for (let i = 0; i < 100; i++) {
      const result = await next();
      if (result.kind === "failure") return { pages, failure: result };
      pages.push(result);
      if (result.complete) return { pages };
    }
    throw new Error("Unbounded fixture run");
  };
  return { fetch, connector, next, drain };
}

const link = () => Response.json({ ...fintocLink, link_token: null });

describe("operation-owned Fintoc snapshot pages", () => {
  it("imports source balances and partial booked history while excluding pending/processing records and emitting explicit reversals", async () => {
    const f = setup(
      [
        link(),
        Response.json([
          fintocAccount,
          { ...fintocAccount, id: "acc_card", type: "credit_card" },
          { ...fintocAccount, id: "acc_usd", currency: "USD" },
          { ...fintocAccount, id: "acc_line", type: "line_of_credit" },
        ]),
        Response.json([
          fintocMovement,
          {
            ...fintocMovement,
            id: "mov_credit",
            amount: 100_000,
            type: "transfer",
            sender_account: { holder_id: "12345678-5" },
          },
          {
            ...fintocMovement,
            id: "mov_pending",
            type: "check",
            pending: true,
          },
          { ...fintocMovement, id: "mov_processing", status: "processing" },
          { ...fintocMovement, id: "mov_reversed", status: "reversed" },
          {
            ...fintocMovement,
            id: "mov_manual_reversal",
            status: "manually_reversed",
          },
        ]),
        Response.json([fintocMovement]), // Same ID in another account is valid.
      ],
      ["acc_checking", "acc_card"],
    );
    const result = await f.drain();
    expect(result.failure).toBeUndefined();
    expect(result.pages).toHaveLength(4);
    expect(result.pages.flatMap((page) => page.movements)).toHaveLength(3);
    expect(result.pages.flatMap((page) => page.removedMovements)).toHaveLength(
      2,
    );
    expect(result.pages[2].accounts[0].historyCoverage).toEqual({
      completeness: "partial",
      from: "2026-11-01",
      through: "2026-11-01",
    });
    expect(result.pages.at(-1)).toMatchObject({
      complete: true,
      checkpoint: null,
      nextCursor: null,
    });
    expect(f.connector.report).toMatchObject({
      importedAccounts: 2,
      bookedMovements: 3,
      reversedMovements: 2,
      ignoredPendingMovements: 1,
      ignoredProcessingMovements: 1,
      uncertainMovements: 3,
      unknownCardBalances: ["acc_card"],
      skippedAccounts: [],
    });
    for (const [address, options] of f.fetch.mock.calls) {
      expect(new URL(String(address)).origin).toBe("https://api.fintoc.com");
      expect(new Headers(options?.headers).get("Fintoc-Version")).toBe(
        "2026-02-01",
      );
    }
    const movementsUrl = new URL(String(f.fetch.mock.calls[2][0]));
    expect(movementsUrl.searchParams.get("confirmed_only")).toBe("false");
    expect(movementsUrl.searchParams.get("per_page")).toBe("300");
    expect(movementsUrl.searchParams.get("since")).toBe(
      fintocHistoryWindow.from,
    );
    expect(movementsUrl.searchParams.get("until")).toBe(
      fintocHistoryWindow.through,
    );
  });

  it("uses bounded integer pagination for both inventory and movements, never persisting within-run cursors", async () => {
    const accounts = Array.from({ length: 300 }, (_, i) => ({
      ...fintocAccount,
      id: `acc_skip_${i}`,
      currency: "USD",
    }));
    const movements = Array.from({ length: 300 }, (_, i) => ({
      ...fintocMovement,
      id: `mov_${i}`,
    }));
    const f = setup([
      link(),
      Response.json(accounts, {
        headers: {
          "X-Total-Count": "301",
          Link: '<https://api.fintoc.com/v1/accounts?page=2&per_page=300>; rel="next"',
        },
      }),
      Response.json([fintocAccount], { headers: { "X-Total-Count": "301" } }),
      Response.json(movements, { headers: { "X-Total-Count": "301" } }),
      Response.json(
        [
          {
            ...fintocMovement,
            id: "mov_final",
            post_date: "2026-11-08T00:00:00.000Z",
          },
        ],
        { headers: { "X-Total-Count": "301" } },
      ),
    ]);
    const result = await f.drain();
    expect(result.failure).toBeUndefined();
    expect(result.pages.at(-1)?.accounts[0].historyCoverage).toEqual({
      completeness: "partial",
      from: "2026-11-01",
      through: "2026-11-08",
    });
    expect(
      f.fetch.mock.calls
        .slice(1)
        .map(([url]) => new URL(String(url)).searchParams.get("page")),
    ).toEqual(["1", "2", "1", "2"]);
    expect(f.connector.report.bookedMovements).toBe(301);
  });

  it("requests another page when a headerless page is full, including a terminal empty page", async () => {
    const f = setup([
      link(),
      Response.json([fintocAccount]),
      Response.json(
        Array.from({ length: 300 }, (_, i) => ({
          ...fintocMovement,
          id: `mov_${i}`,
        })),
      ),
      Response.json([]),
    ]);
    expect((await f.drain()).failure).toBeUndefined();
    expect(f.fetch).toHaveBeenCalledTimes(4);
  });

  it("honors an explicit terminal Link header even when the final page is full", async () => {
    const f = setup([
      link(),
      Response.json([fintocAccount]),
      Response.json(
        Array.from({ length: 300 }, (_, i) => ({
          ...fintocMovement,
          id: `mov_${i}`,
        })),
        {
          headers: {
            Link: '<https://api.fintoc.com/v1/accounts/acc_checking/movements?page=1>; rel="first"',
          },
        },
      ),
    ]);
    expect((await f.drain()).failure).toBeUndefined();
    expect(f.fetch).toHaveBeenCalledTimes(3);
  });

  it.each([
    "2026-10-31",
    "2026-11-09",
  ])("rejects a provider record outside the requested partial window: %s", async (day) => {
    const f = setup([
      link(),
      Response.json([fintocAccount]),
      Response.json([{ ...fintocMovement, post_date: `${day}T00:00:00.000Z` }]),
    ]);
    expect((await f.drain()).failure?.reason).toBe("invalid_data");
  });

  it.each([
    [Response.json({ ...fintocLink, status: "login_required" }), "expired"],
    [Response.json({ ...fintocLink, active: false }), "revoked"],
    [new Response(null, { status: 404 }), "revoked"],
    [new Response(null, { status: 401 }), "retryable"],
    [Response.json({ ...fintocLink, id: "link_foreign" }), "invalid_data"],
  ])("fails safely on link status/identity without financial reads", async (response, reason) => {
    const f = setup([response]);
    expect(await f.next()).toMatchObject({ kind: "failure", reason });
    expect(f.fetch).toHaveBeenCalledOnce();
  });

  it.each([
    Response.json([fintocAccount], {
      headers: { Link: '<https://evil.example/steal?page=2>; rel="next"' },
    }),
    Response.json([fintocAccount], {
      headers: {
        Link: '<https://api.fintoc.com/v1/accounts?page=1>; rel="next"',
      },
    }),
    Response.json([fintocAccount], { headers: { "X-Total-Count": "301" } }),
    Response.json([fintocAccount], { headers: { "X-Total-Count": "unsafe" } }),
    Response.json([fintocAccount, fintocAccount]),
    Response.json([{ ...fintocAccount, id: "" }]),
    Response.json({ accounts: [fintocAccount] }),
  ])("rejects malformed inventory/pagination rather than committing a partial snapshot", async (response) => {
    const f = setup([link(), response]);
    expect((await f.drain()).failure).toMatchObject({ reason: "invalid_data" });
    expect(f.fetch).toHaveBeenCalledTimes(2);
  });

  it("returns only sanitized retry metadata on provider outages, without mistaking API key rejection for user revocation", async () => {
    const f = setup([
      link(),
      new Response("private-provider-message", {
        status: 429,
        headers: { "Retry-After": "60" },
      }),
    ]);
    const { failure } = await f.drain();
    expect(failure).toMatchObject({ reason: "retryable" });
    expect(failure?.retryAfter).not.toBeNull();
    expect(JSON.stringify(failure)).not.toMatch(
      /private-provider|token_|sk_test/,
    );
    const unauthorized = setup([link(), new Response(null, { status: 401 })]);
    expect((await unauthorized.drain()).failure?.reason).toBe("retryable");
  });

  it("rejects changing page totals and duplicate movement IDs across pages", async () => {
    const first = Array.from({ length: 300 }, (_, index) => ({
      ...fintocMovement,
      id: `mov_${index}`,
    }));
    for (const last of [
      Response.json(
        [
          { ...fintocMovement, id: "mov_new" },
          { ...fintocMovement, id: "mov_newer" },
        ],
        { headers: { "X-Total-Count": "302" } },
      ),
      Response.json([{ ...fintocMovement, id: "mov_0" }], {
        headers: { "X-Total-Count": "301" },
      }),
    ]) {
      const f = setup([
        link(),
        Response.json([fintocAccount]),
        Response.json(first, { headers: { "X-Total-Count": "301" } }),
        last,
      ]);
      expect((await f.drain()).failure?.reason).toBe("invalid_data");
      expect(f.fetch).toHaveBeenCalledTimes(4);
    }
  });

  it("keeps malformed/oversized provider response text out of errors", async () => {
    for (const response of [
      new Response("private-malformed-json"),
      Response.json({ private: "x".repeat(1024 * 1024) }),
    ]) {
      const f = setup([link(), response]);
      const result = await f.drain();
      expect(result.failure?.reason).toBe("invalid_data");
      expect(JSON.stringify(result.failure)).not.toMatch(
        /private|token_|sk_test/,
      );
    }
  });

  it("rejects repeated movement identities, invalid amounts and missing pinned-version status", async () => {
    for (const data of [
      [fintocMovement, fintocMovement],
      [{ ...fintocMovement, amount: 0 }],
      [{ ...fintocMovement, amount: 9007199254740992 }],
      [{ ...fintocMovement, status: undefined }],
    ]) {
      const f = setup([
        link(),
        Response.json([fintocAccount]),
        Response.json(data),
      ]);
      expect((await f.drain()).failure?.reason).toBe("invalid_data");
    }
  });

  it("does not share credentials, cursors or inventory between runs and rejects foreign input before I/O", async () => {
    const a = setup([link(), Response.json([])], []),
      b = setup([link(), Response.json([])], []);
    expect((await a.drain()).failure).toBeUndefined();
    expect((await b.drain()).failure).toBeUndefined();
    expect(a.connector.report).not.toBe(b.connector.report);
    const foreign = setup([]);
    expect(
      await foreign.connector.fetchPage({
        connectionId: "foreign",
        checkpoint: null,
        pageCursor: null,
      }),
    ).toMatchObject({ kind: "failure", reason: "invalid_data" });
    expect(foreign.fetch).not.toHaveBeenCalled();
  });
});
