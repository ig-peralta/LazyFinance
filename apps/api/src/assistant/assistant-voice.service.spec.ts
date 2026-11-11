import { Test } from "@nestjs/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { testEnvironment } from "../../tests/fixtures/environment";
import { ENV_SCHEMA } from "../environment/environment.schema";
import { EnvironmentService } from "../environment/environment.service";
import { AssistantService } from "./assistant.service";
import { AssistantVoiceService, VOICE_FETCH } from "./assistant-voice.service";

async function setup(enabled = true) {
  const get = vi.fn(async (_input: { id: string }) => ({}));
  const conversations = vi.fn((_owner: string) => ({ get: { query: get } }));
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
      { provide: AssistantService, useValue: { conversations } },
      {
        provide: EnvironmentService,
        useValue: testEnvironment({
          ASSISTANT_VOICE_ENABLED: enabled ? "true" : "false",
          ASSISTANT_VOICE_MODEL: "configured-voice-model",
          ASSISTANT_VOICE_API_KEY: "server-only-key",
        }),
      },
      { provide: VOICE_FETCH, useValue: request },
    ],
  }).compile();
  return {
    voice: module.get(AssistantVoiceService),
    request,
    conversations,
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

describe("voice admission, provider privacy and owner-bound termination", () => {
  afterEach(() => vi.useRealTimers());

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

  it("exchanges real SDP with server-only configuration, no finance tools and no automatic answers", async () => {
    const f = await setup();
    const session = await f.voice.start("owner", origin, input, signal());
    const body = f.request.mock.calls[0][1]?.body;
    expect(body).toBeInstanceOf(FormData);
    if (!(body instanceof FormData)) throw new Error("Missing SDP form");
    expect(body.get("sdp")).toBe(input.sdp);
    expect(JSON.parse(String(body.get("session")))).toMatchObject({
      tools: [],
      max_output_tokens: 1024,
      audio: { input: { turn_detection: { create_response: false } } },
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
