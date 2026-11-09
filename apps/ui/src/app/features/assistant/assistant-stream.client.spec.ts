import { TestBed } from "@angular/core/testing";
import type {
  AssistantEvent,
  AssistantSend,
  AssistantTurn,
} from "@lazyfinance/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assistantAction } from "../../../testing/assistant";
import { deferred } from "../../../testing/deferred";
import { principal, setupRpc } from "../../../testing/rpc";
import { AssistantStreamClient } from "./assistant-stream.client";

const message: AssistantSend = {
  conversationId: "00000000-0000-4000-8000-000000000001",
  requestId: "00000000-0000-4000-8000-000000000002",
  text: "¿Mis saldos?",
};
const pending: AssistantTurn = {
  id: message.requestId,
  question: message.text,
  text: "",
  status: "pending",
  sources: [],
  actions: [],
  createdAt: "2026-11-09T03:00:00.000Z",
};
const complete: AssistantTurn = {
  ...pending,
  text: "Información consultada.",
  status: "complete",
};
const start: AssistantEvent = { type: "turn", turn: pending };
const done: AssistantEvent = { type: "done", turn: complete };

function response(events: AssistantEvent[], fragment = false) {
  const data = new TextEncoder().encode(
    events.map((event) => JSON.stringify(event)).join("\n"),
  );
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        if (fragment)
          for (const byte of data) controller.enqueue(Uint8Array.of(byte));
        else controller.enqueue(data);
        controller.close();
      },
    }),
    { headers: { "content-type": "application/x-ndjson; charset=utf-8" } },
  );
}

function setup() {
  const f = setupRpc();
  const owner = f.credentials.current();
  if (!owner) throw new Error("Missing fixture owner");
  return { ...f, owner, client: TestBed.inject(AssistantStreamClient) };
}

describe("bounded credential-scoped assistant stream protocol", () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it("decodes fragmented UTF-8 and final lines, sends only the nonce/message/ID and requires saved completion", async () => {
    const f = setup();
    const events: AssistantEvent[] = [
      start,
      { type: "delta", text: "Información ñ 💚" },
      done,
    ];
    f.fetch.mockResolvedValueOnce(response(events, true));
    const receive = vi.fn();
    await f.client.send(
      f.owner,
      { ...message, text: `  ${message.text}  ` },
      new AbortController().signal,
      receive,
    );
    expect(receive.mock.calls.map(([event]) => event)).toEqual(events);
    const [url, options] = f.fetch.mock.calls[0];
    expect(url).toBe("http://api.test/assistant/turns");
    expect(options).toMatchObject({
      method: "POST",
      credentials: "omit",
      cache: "no-store",
      body: JSON.stringify(message),
    });
    expect(new Headers(options?.headers).get("authorization")).toBe(
      "Bearer alice",
    );
  });

  it.each([
    [start, { type: "delta", text: "Incompleta" }],
    [start, { type: "done", turn: pending }],
    [
      start,
      { type: "done", turn: { ...complete, id: message.conversationId } },
    ],
    [{ type: "delta", text: "Sin inicio" }, done],
    [start, done, { type: "delta", text: "Después del cierre" }],
  ] satisfies AssistantEvent[][])("rejects incomplete, foreign or out-of-order protocol case %# without replay", async (...events) => {
    const f = setup();
    f.fetch.mockResolvedValueOnce(response(events));
    await expect(
      f.client.send(f.owner, message, new AbortController().signal, () => {}),
    ).rejects.toThrow();
    expect(f.fetch).toHaveBeenCalledOnce();
  });

  it("rejects malformed encoding and cumulative output beyond the turn bound", async () => {
    const f = setup();
    f.fetch.mockResolvedValueOnce(
      response([
        start,
        { type: "delta", text: "x".repeat(10000) },
        { type: "delta", text: "x".repeat(10000) },
        done,
      ]),
    );
    await expect(
      f.client.send(f.owner, message, new AbortController().signal, () => {}),
    ).rejects.toThrow(/límite/);
    f.fetch.mockResolvedValueOnce(
      new Response(Uint8Array.of(255), {
        headers: { "content-type": "application/x-ndjson" },
      }),
    );
    await expect(
      f.client.send(f.owner, message, new AbortController().signal, () => {}),
    ).rejects.toThrow();
  });

  it("accepts a matching proposal but waits for saved completion before confirming the turn", async () => {
    const f = setup();
    const action = assistantAction({ turnId: message.requestId });
    const events: AssistantEvent[] = [
      start,
      { type: "action", action },
      { type: "done", turn: { ...complete, actions: [action] } },
    ];
    f.fetch.mockResolvedValueOnce(response(events, true));
    const receive = vi.fn();
    await f.client.send(
      f.owner,
      message,
      new AbortController().signal,
      receive,
    );
    expect(receive.mock.calls.map(([event]) => event)).toEqual(events);
  });

  it.each([
    "conversation",
    "turn",
    "origin",
    "status",
    "saved-owner",
    "duplicate",
    "limit",
  ])("rejects a mismatched or excessive %s action without a mutation replay", async (kind) => {
    const f = setup();
    const action = assistantAction({ turnId: message.requestId });
    const invalid = {
      ...action,
      ...(kind === "conversation" || kind === "saved-owner"
        ? { conversationId: action.id }
        : {}),
      ...(kind === "turn" ? { turnId: action.id } : {}),
      ...(kind === "origin" ? { origin: "mcp" as const } : {}),
      ...(kind === "status" ? { status: "applied" as const } : {}),
    };
    const actions: AssistantEvent[] =
      kind === "saved-owner" || kind === "duplicate"
        ? [
            {
              type: "done",
              turn: {
                ...complete,
                actions: kind === "duplicate" ? [action, action] : [invalid],
              },
            },
          ]
        : kind === "limit"
          ? Array.from({ length: 5 }, (_, index) => ({
              type: "action",
              action: {
                ...action,
                id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
              },
            }))
          : [{ type: "action", action: invalid }];
    f.fetch.mockResolvedValueOnce(response([start, ...actions, done]));
    await expect(
      f.client.send(f.owner, message, new AbortController().signal, () => {}),
    ).rejects.toThrow(/propuesta/);
    expect(f.fetch).toHaveBeenCalledOnce();
  });

  it("expires only the snapshot that received a 401, not a newer owner or refreshed token", async () => {
    const f = setup();
    const late = deferred<Response>();
    f.fetch.mockReturnValueOnce(late.promise);
    const failed = expect(
      f.client.send(f.owner, message, new AbortController().signal, () => {}),
    ).rejects.toThrow();
    f.credentials.accept({ ...principal, userId: "owner-b" }, "new-token");
    late.resolve(new Response(null, { status: 401 }));
    await failed;
    expect(f.credentials.current()?.token).toBe("new-token");
    const current = f.credentials.current();
    if (!current) throw new Error("Missing new owner");
    f.fetch.mockResolvedValueOnce(new Response(null, { status: 401 }));
    await expect(
      f.client.send(current, message, new AbortController().signal, () => {}),
    ).rejects.toThrow();
    expect(f.credentials.current()).toBeUndefined();
  });

  it.each([
    "logout",
    "stop",
  ])("never delivers obsolete events after %s, even from a transport ignoring cancellation", async (action) => {
    const f = setup();
    const late = deferred<Response>();
    const controller = new AbortController();
    const receive = vi.fn();
    f.fetch.mockReturnValueOnce(late.promise);
    const task = expect(
      f.client.send(f.owner, message, controller.signal, receive),
    ).rejects.toThrow();
    if (action === "logout") f.credentials.clear();
    else controller.abort();
    late.resolve(response([start, done]));
    await task;
    expect(receive).not.toHaveBeenCalled();
    expect(f.fetch.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });
});
