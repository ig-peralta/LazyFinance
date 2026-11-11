import { Test } from "@nestjs/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { testEnvironment } from "../../tests/fixtures/environment";
import { ENV_SCHEMA } from "../environment/environment.schema";
import { EnvironmentService } from "../environment/environment.service";
import { AssistantService } from "./assistant.service";
import { AssistantVoiceService, VOICE_FETCH } from "./assistant-voice.service";
import {
  AssistantVoiceRuntime,
  type RealtimeConversation,
} from "./assistant-voice-runtime";

async function setup(enabled = true, voiceName: "marin" | "cedar" = "marin") {
  const listen = vi.fn<RealtimeConversation["listen"]>(async () => {});
  const stop = vi.fn<RealtimeConversation["close"]>(async () => {});
  const get = vi.fn(async (_input: { id: string }) => ({}));
  const conversations = vi.fn((_owner: string) => ({ get: { query: get } }));
  const requireConsent = vi.fn<AssistantService["requireConsent"]>(
    async () => {},
  );
  const request = vi.fn<typeof fetch>(async (_url, options) =>
    options?.body instanceof FormData
      ? new Response("v=0\r\nanswer", {
          headers: { location: "/v1/realtime/calls/rtc_test" },
        })
      : new Response(null, { status: 200 }),
  );
  const module = await Test.createTestingModule({
    providers: [
      AssistantVoiceService,
      {
        provide: AssistantVoiceRuntime,
        useValue: {
          connect: vi.fn(async () => ({
            close: stop,
            listen,
          })),
        },
      },
      {
        provide: AssistantService,
        useValue: { conversations, requireConsent },
      },
      {
        provide: EnvironmentService,
        useValue: testEnvironment({
          ASSISTANT_VOICE_ENABLED: enabled ? "true" : "false",
          ASSISTANT_VOICE_MODEL: "configured-voice-model",
          ASSISTANT_VOICE_API_KEY: "server-only-key",
          ASSISTANT_VOICE_NAME: voiceName,
        }),
      },
      { provide: VOICE_FETCH, useValue: request },
    ],
  }).compile();
  return {
    voice: module.get(AssistantVoiceService),
    listen,
    stop,
    request,
    conversations,
    requireConsent,
    get,
    close: () => module.close(),
  };
}
const input = {
  conversationId: "00000000-0000-4000-8000-000000000001",
  sdp: "v=0\r\noffer",
};
const origin = "http://localhost:4200";
const signal = () => new AbortController().signal;

function pendingResponse() {
  let resolve: (value: Response) => void = (_value: Response) => {
    throw new Error("Not initialized");
  };
  const promise = new Promise<Response>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const answer = () =>
  new Response("v=0\r\nanswer", {
    headers: { location: "/v1/realtime/calls/rtc_late" },
  });

describe("voice admission, provider privacy and owner-bound termination", () => {
  it("selects a configured recommended timbre only when starting a new call", async () => {
    expect(ENV_SCHEMA.parse({}).ASSISTANT_VOICE_NAME).toBe("marin");
    expect(
      ENV_SCHEMA.safeParse({ ASSISTANT_VOICE_NAME: "unrecognized" }).success,
    ).toBe(false);
    const f = await setup(true, "cedar");
    try {
      await f.voice.start("owner", origin, input, signal());
      const body = f.request.mock.calls[0][1]?.body;
      if (!(body instanceof FormData)) throw new Error("Expected call setup");
      expect(JSON.parse(String(body.get("session"))).audio.output.voice).toBe(
        "cedar",
      );
    } finally {
      await f.close();
    }
  });
  it("rejects foreign and duplicate observers without closing the existing owner's stream", async () => {
    const f = await setup();
    const controller = new AbortController();
    f.listen.mockImplementation(async (signal) => {
      if (!signal.aborted)
        await new Promise<void>((resolve) =>
          signal.addEventListener("abort", () => resolve(), { once: true }),
        );
    });
    try {
      const session = await f.voice.start("owner", origin, input, signal());
      await expect(
        f.voice.listen("foreign", session.id, signal(), async () => {}),
      ).rejects.toThrow();
      expect(f.stop).not.toHaveBeenCalled();
      const observation = f.voice.listen(
        "owner",
        session.id,
        controller.signal,
        async () => {},
      );
      await vi.waitFor(() => expect(f.listen).toHaveBeenCalledOnce());
      await expect(
        f.voice.listen("owner", session.id, signal(), async () => {}),
      ).rejects.toThrow();
      expect(f.stop).not.toHaveBeenCalled();
      controller.abort();
      await observation;
      expect(f.stop).toHaveBeenCalledOnce();
      expect(f.request.mock.calls.at(-1)?.[0]).toContain("/hangup");
    } finally {
      controller.abort();
      await f.close();
    }
  });
  afterEach(() => vi.useRealTimers());

  it("checks consent after the origin gate and before history, admission or provider requests", async () => {
    const f = await setup();
    try {
      await expect(
        f.voice.start("owner", "https://untrusted.test", input, signal()),
      ).rejects.toThrow();
      expect(f.requireConsent).not.toHaveBeenCalled();
      f.requireConsent.mockRejectedValue(new Error("Consent refused"));
      await expect(
        f.voice.start("owner", origin, input, signal()),
      ).rejects.toThrow("Consent refused");
      expect(f.conversations).not.toHaveBeenCalled();
      expect(f.request).not.toHaveBeenCalled();
      f.requireConsent.mockImplementation(async () => {});
      await f.voice.start("owner", origin, input, signal());
      expect(f.request).toHaveBeenCalledOnce();
    } finally {
      await f.close();
    }
  });

  it("honors cancellation occurring during the consent check without consuming admission", async () => {
    const f = await setup();
    const controller = new AbortController();
    f.requireConsent.mockImplementation(async () => {
      controller.abort();
    });
    try {
      await expect(
        f.voice.start("owner", origin, input, controller.signal),
      ).rejects.toThrow();
      expect(f.conversations).not.toHaveBeenCalled();
      expect(f.request).not.toHaveBeenCalled();
    } finally {
      await f.close();
    }
  });

  it("drains an initializing call, rejects new starts and hangs up its late remote ID", async () => {
    const f = await setup();
    const pending = pendingResponse();
    f.request.mockReturnValueOnce(pending.promise);
    const started = f.voice
      .start("owner", origin, input, signal())
      .catch((error: unknown) => error);
    await vi.waitFor(() => expect(f.request).toHaveBeenCalledOnce());
    let drained = false;
    const shutdown = f.voice.onModuleDestroy().then(() => {
      drained = true;
    });
    await expect(
      f.voice.start("other", origin, input, signal()),
    ).rejects.toThrow("Voice unavailable");
    expect(drained).toBe(false);
    pending.resolve(answer());
    await started;
    await shutdown;
    expect(f.request).toHaveBeenCalledTimes(2);
    expect(f.request.mock.calls[1][0]).toContain("rtc_late/hangup");
    await f.close();
  });

  it("retries failed shutdown hangup within the drain and retains unresolved IDs for another recovery attempt", async () => {
    const f = await setup();
    await f.voice.start("owner", origin, input, signal());
    f.request.mockResolvedValue(new Response(null, { status: 503 }));
    await f.voice.onModuleDestroy();
    expect(f.request).toHaveBeenCalledTimes(4); // creation + three bounded attempts
    f.request.mockResolvedValue(new Response(null, { status: 200 }));
    await f.voice.onModuleDestroy();
    expect(f.request).toHaveBeenCalledTimes(5); // unresolved remote ID was not erased
    await f.close();
  });

  it("bounds shutdown waiting and still terminates a response arriving after the drain deadline", async () => {
    const f = await setup();
    const pending = pendingResponse();
    f.request.mockReturnValueOnce(pending.promise);
    const started = f.voice
      .start("owner", origin, input, signal())
      .catch((error: unknown) => error);
    await vi.waitFor(() => expect(f.request).toHaveBeenCalledOnce());
    vi.useFakeTimers();
    const shutdown = f.voice.onModuleDestroy();
    await vi.advanceTimersByTimeAsync(20_000);
    await shutdown;
    expect(f.request).toHaveBeenCalledOnce();
    pending.resolve(answer());
    await started;
    expect(f.request.mock.calls[1][0]).toContain("rtc_late/hangup");
    await f.close();
  });

  it("rejects redirects and cancels an oversized SDP stream before consuming the rest", async () => {
    const f = await setup();
    const cancelled = vi.fn();
    f.request.mockResolvedValueOnce(
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array(64_001));
          },
          cancel: cancelled,
        }),
        { headers: { location: "/v1/realtime/calls/rtc_large" } },
      ),
    );
    await expect(
      f.voice.start("owner", origin, input, signal()),
    ).rejects.toThrow("Puedes continuar por texto");
    expect(cancelled).toHaveBeenCalledOnce();
    expect(f.request).toHaveBeenCalledTimes(2);
    expect(
      f.request.mock.calls.every(
        ([, options]) => options?.redirect === "error",
      ),
    ).toBe(true);
    await f.close();
  });

  it("defaults closed and requires dedicated configuration before enabling", async () => {
    expect(ENV_SCHEMA.parse({}).ASSISTANT_VOICE_ENABLED).toBe("false");
    expect(
      ENV_SCHEMA.safeParse({ ASSISTANT_VOICE_ENABLED: "true" }).success,
    ).toBe(false);
    const f = await setup(false);
    await expect(
      f.voice.start("owner", origin, input, signal()),
    ).rejects.toThrow();
    expect(f.request).not.toHaveBeenCalled();
    await f.close();
  });

  it("checks origin and authoritative conversation ownership before contacting the provider", async () => {
    const f = await setup();
    await expect(
      f.voice.start("owner", "https://foreign.invalid", input, signal()),
    ).rejects.toThrow();
    f.get.mockRejectedValueOnce(new Error("Foreign conversation"));
    await expect(
      f.voice.start("owner", origin, input, signal()),
    ).rejects.toThrow("Foreign conversation");
    expect(f.conversations).toHaveBeenCalledWith("owner");
    expect(f.request).not.toHaveBeenCalled();
    await f.close();
  });

  it("exchanges SDP without automatic answers before the server sideband installs tools", async () => {
    const f = await setup();
    const session = await f.voice.start("owner", origin, input, signal());
    const body = f.request.mock.calls[0][1]?.body;
    expect(body).toBeInstanceOf(FormData);
    if (!(body instanceof FormData)) throw new Error("Missing SDP form");
    expect(body.get("sdp")).toBe(input.sdp);
    expect(JSON.parse(String(body.get("session")))).toMatchObject({
      tools: [],
      max_output_tokens: 320,
      audio: {
        input: {
          turn_detection: {
            type: "semantic_vad",
            eagerness: "low",
            create_response: false,
            interrupt_response: true,
          },
        },
        output: { voice: "marin" },
      },
    });
    expect(JSON.stringify(session)).not.toContain("server-only-key");
    expect(JSON.stringify(session)).not.toContain("rtc_test");
    await f.voice.end("foreign", session.id);
    expect(f.request).toHaveBeenCalledOnce();
    await f.voice.end("owner", session.id);
    expect(f.request.mock.calls[1][0]).toBe(
      "https://api.openai.com/v1/realtime/calls/rtc_test/hangup",
    );
    await f.close();
  });

  it("reserves concurrent initialization and caps starts per owner without retrying creation", async () => {
    const f = await setup();
    const first = await f.voice.start("owner", origin, input, signal());
    await expect(
      f.voice.start("owner", origin, input, signal()),
    ).rejects.toThrow("Voice capacity");
    await f.voice.end("owner", first.id);
    for (let i = 0; i < 2; i++) {
      const next = await f.voice.start("owner", origin, input, signal());
      await f.voice.end("owner", next.id);
    }
    await expect(
      f.voice.start("owner", origin, input, signal()),
    ).rejects.toThrow("Voice capacity");
    expect(
      f.request.mock.calls.filter((call) => call[1]?.body instanceof FormData),
    ).toHaveLength(3);
    await f.close();
  });

  it("hangs up after the duration bound and sanitizes provider failures", async () => {
    const f = await setup();
    vi.useFakeTimers();
    await f.voice.start("owner", origin, input, signal());
    await vi.advanceTimersByTimeAsync(300_000);
    expect(f.request).toHaveBeenCalledTimes(2);
    f.request.mockRejectedValueOnce(
      new Error("Vendor failure containing private key"),
    );
    await expect(
      f.voice.start("other", origin, input, signal()),
    ).rejects.toThrow("Puedes continuar por texto");
    await f.close();
  });

  it("hangs up a late initialized call after the browser has disconnected", async () => {
    const f = await setup();
    const controller = new AbortController();
    f.request.mockImplementationOnce(async () => {
      controller.abort();
      return new Response("v=0\r\nanswer", {
        headers: { location: "/v1/realtime/calls/rtc_test" },
      });
    });
    await expect(
      f.voice.start("owner", origin, input, controller.signal),
    ).rejects.toThrow("Puedes continuar por texto");
    expect(f.request).toHaveBeenCalledTimes(2);
    await f.close();
  });
});
