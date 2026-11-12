import { TestBed } from "@angular/core/testing";
import type { AssistantVoiceEvent } from "@lazyfinance/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deferred } from "../../../testing/deferred";
import { principal, setupRpc } from "../../../testing/rpc";
import { RPC_FETCH } from "../../core/rpc/rpc-client";
import { AssistantVoiceClient, VOICE_MEDIA } from "./assistant-voice.client";

function setup() {
  const track = Object.assign(new EventTarget(), {
    stop: vi.fn(),
    enabled: true,
  });
  const microphone = {
    getTracks: () => [track],
    getAudioTracks: () => [track],
  };
  const media = {
    supported: () => true,
    microphone: vi.fn(async () => microphone),
    peer: vi.fn(() => peer),
    audio: vi.fn(() => audio),
  };
  const channel = {
    readyState: "open",
    send: vi.fn<(text: string) => void>(),
    close: vi.fn(),
    onopen: null as (() => void) | null,
    onclose: null as (() => void) | null,
    onerror: null as (() => void) | null,
    onmessage: null as ((event: { data: string }) => void) | null,
  };
  const peer = {
    addTrack: vi.fn(),
    close: vi.fn(),
    connectionState: "connected",
    ontrack: null,
    onconnectionstatechange: null as (() => void) | null,
    createDataChannel: vi.fn(() => channel),
    createOffer: vi.fn(async () => ({ type: "offer", sdp: "v=0\r\noffer" })),
    setLocalDescription: vi.fn(async () => {}),
    setRemoteDescription: vi.fn(async () => {}),
  };
  const audio = {
    play: vi.fn(async () => {}),
    pause: vi.fn(),
    muted: false,
    srcObject: null,
  };
  let observations:
    | {
        controller: ReadableStreamDefaultController<Uint8Array>;
        closed: boolean;
      }
    | undefined;
  const request = vi.fn<typeof fetch>(async (url, options) =>
    String(url).endsWith("/events")
      ? new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              const stream = { controller, closed: false };
              observations = stream;
              options?.signal?.addEventListener(
                "abort",
                () => {
                  if (!stream.closed) {
                    stream.closed = true;
                    controller.close();
                  }
                },
                { once: true },
              );
            },
            cancel() {
              if (observations) observations.closed = true;
            },
          }),
          { headers: { "content-type": "application/x-ndjson" } },
        )
      : new Response(
          JSON.stringify({
            id: "00000000-0000-4000-8000-000000000009",
            sdp: "v=0\r\nanswer",
            expiresAt: "2026-11-10T04:05:00.000Z",
          }),
          { headers: { "content-type": "application/json" } },
        ),
  );
  const f = setupRpc({}, "browser", true, [
    AssistantVoiceClient,
    { provide: VOICE_MEDIA, useValue: media },
    { provide: RPC_FETCH, useValue: request },
  ]);
  const voice = TestBed.inject(AssistantVoiceClient);
  const owner = f.credentials.current();
  if (!owner) throw new Error("Missing credentials");
  const receive = vi.fn<(event: AssistantVoiceEvent) => void>();
  const start = () =>
    voice.start(owner, "00000000-0000-4000-8000-000000000001", receive);
  const event = (value: unknown) =>
    channel.onmessage?.({ data: JSON.stringify(value) });
  return {
    ...f,
    voice,
    owner,
    media,
    microphone,
    track,
    peer,
    channel,
    audio,
    request,
    receive,
    start,
    event,
    observe(event: AssistantVoiceEvent) {
      if (!observations || observations.closed)
        throw new Error("No observation stream");
      observations.controller.enqueue(
        new TextEncoder().encode(`${JSON.stringify(event)}\n`),
      );
    },
    eof() {
      if (!observations || observations.closed)
        throw new Error("No observation stream");
      observations.closed = true;
      observations.controller.close();
    },
  };
}

describe("continuous live voice media and session lifetimes", () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("ignores all input/output transcription events without retaining captions or submitting text", async () => {
    const f = setup();
    await f.start();
    f.channel.onopen?.();
    f.event({ type: "input_audio_buffer.speech_started", item_id: "a" });
    f.event({ type: "input_audio_buffer.speech_started", item_id: "b" });
    f.event({
      type: "conversation.item.input_audio_transcription.completed",
      item_id: "b",
      transcript: "Segunda pregunta",
    });
    f.event({
      type: "conversation.item.input_audio_transcription.delta",
      item_id: "a",
      delta: "Parcial privado",
    });
    f.event({
      type: "conversation.item.input_audio_transcription.completed",
      item_id: "a",
      transcript: "Primera pregunta",
    });
    f.event({
      type: "conversation.item.input_audio_transcription.failed",
      item_id: "b",
    });
    f.event({
      type: "response.output_audio_transcript.delta",
      response_id: "r1",
      delta: "Respuesta privada",
    });
    f.observe({ type: "delta", text: "Texto hablado de un servidor anterior" });
    await Promise.resolve();
    await Promise.resolve();
    expect(f.receive).not.toHaveBeenCalled();
    expect(f.voice).not.toHaveProperty("inputTranscript");
    expect(f.voice).not.toHaveProperty("inputTranscripts");
    expect(f.voice).not.toHaveProperty("outputTranscript");
    expect(f.voice.state()).toBe("listening");
    expect(f.voice.problem()).toBeNull();
    expect(f.request).toHaveBeenCalledTimes(2);
    expect(
      f.channel.send.mock.calls.every(([value]) => !value.includes("pregunta")),
    ).toBe(true);
  });

  it("sends ordered, session-scoped screen selections without sending financial contents", async () => {
    const f = setup();
    await f.start();
    f.channel.onopen?.();
    const turnId = "00000000-0000-4000-8000-000000000020";
    f.voice.acknowledgeScreen({ kind: "source", turnId, sourceId: "F1" });
    f.voice.acknowledgeScreen({
      kind: "proposal",
      actionId: "00000000-0000-4000-8000-000000000021",
    });

    await vi.waitFor(() =>
      expect(
        f.request.mock.calls.filter(([url]) => String(url).endsWith("/screen")),
      ).toHaveLength(2),
    );
    const calls = f.request.mock.calls.filter(([url]) =>
      String(url).endsWith("/screen"),
    );
    expect(JSON.parse(String(calls[0][1]?.body))).toEqual({
      id: "00000000-0000-4000-8000-000000000009",
      selection: { kind: "source", turnId, sourceId: "F1" },
    });
    expect(JSON.parse(String(calls[1][1]?.body))).toEqual({
      id: "00000000-0000-4000-8000-000000000009",
      selection: {
        kind: "proposal",
        actionId: "00000000-0000-4000-8000-000000000021",
      },
    });
    expect(calls[0][1]?.headers).toMatchObject({
      authorization: expect.stringMatching(/^Bearer /),
    });
    await f.voice.end();
  });

  it("waits for asynchronous session closure, exposes reconciliation once and never reconnects", async () => {
    const f = setup();
    await f.start();
    f.channel.onopen?.();
    const closing = deferred<Response>();
    f.request.mockReturnValueOnce(closing.promise);
    f.peer.connectionState = "failed";
    f.peer.onconnectionstatechange?.();
    expect(f.voice.state()).toBe("off");
    expect(f.voice.problem()?.code).toBe("connection_lost");
    expect(f.voice.stopping()).toBe(true);
    expect(f.voice.closed()).toBe(0);
    await f.start();
    expect(f.media.microphone).toHaveBeenCalledOnce();
    closing.resolve(new Response(null, { status: 200 }));
    await vi.waitFor(() => expect(f.voice.closed()).toBe(1));
    expect(f.voice.stopping()).toBe(false);
    expect(f.request).toHaveBeenCalledTimes(3);
    expect(f.receive).not.toHaveBeenCalled();
  });

  it("clears discarded audio and bounds explicitly committed native turns", async () => {
    const f = setup();
    await f.start();
    f.channel.onopen?.();
    f.voice.speak();
    expect(f.track.enabled).toBe(true);
    f.voice.discardRecording();
    expect(f.track.enabled).toBe(false);
    expect(f.voice.state()).toBe("listening");
    expect(
      f.channel.send.mock.calls.some(
        ([text]) => JSON.parse(text).type === "input_audio_buffer.clear",
      ),
    ).toBe(true);
    f.voice.speak();
    f.voice.submit();
    expect(f.voice.state()).toBe("querying");
    f.event({
      type: "conversation.item.input_audio_transcription.completed",
      item_id: "a",
      transcript: "Obsoleta",
    });
    f.event({
      type: "conversation.item.input_audio_transcription.completed",
      item_id: "b",
      transcript: "Obsoleta",
    });
    expect(f.receive).not.toHaveBeenCalled();
    for (let index = 1; index <= 24; index++)
      f.event({
        type: "input_audio_buffer.committed",
        item_id: `item-${index}`,
      });
    expect(f.voice.state()).toBe("querying");
    f.event({ type: "input_audio_buffer.committed", item_id: "item-25" });
    expect(f.voice.state()).toBe("off");
    expect(f.track.stop).toHaveBeenCalledOnce();
  });

  it("does not capture until Start and never treats spoken agreement as financial approval", async () => {
    const f = setup();
    expect(f.media.microphone).not.toHaveBeenCalled();
    await f.start();
    f.channel.onopen?.();
    expect(f.peer.addTrack).toHaveBeenCalledWith(f.track, f.microphone);
    expect(f.track.enabled).toBe(false);
    expect(f.peer.setRemoteDescription).toHaveBeenCalledWith({
      type: "answer",
      sdp: "v=0\r\nanswer",
    });
    f.event({ type: "input_audio_buffer.speech_started", item_id: "i1" });
    expect(f.voice.state()).toBe("listening");
    f.event({
      type: "conversation.item.input_audio_transcription.completed",
      item_id: "i1",
      transcript: "Sí, aprueba",
    });
    f.event({
      type: "conversation.item.input_audio_transcription.completed",
      item_id: "i1",
      transcript: "Sí, aprueba",
    });
    expect(f.receive).not.toHaveBeenCalled();
    expect(f.request).toHaveBeenCalledTimes(2); // SDP and authenticated observations, never approval.
    expect(f.voice.problem()).toBeNull();
  });

  it("uses explicit start and submit controls and offers stop-and-speak instead of acoustic barge-in", async () => {
    const f = setup();
    await f.start();
    f.channel.onopen?.();
    expect(f.track.enabled).toBe(false);
    f.voice.speak();
    expect(f.track.enabled).toBe(true);
    expect(f.voice.state()).toBe("recording");
    f.event({ type: "input_audio_buffer.speech_started", item_id: "i0" });
    expect(f.voice.state()).toBe("recording");
    expect(
      f.channel.send.mock.calls.some(
        ([text]) => JSON.parse(text).type === "response.cancel",
      ),
    ).toBe(false);
    f.voice.submit();
    expect(f.track.enabled).toBe(false);
    expect(f.voice.state()).toBe("querying");
    f.event({ type: "input_audio_buffer.committed", item_id: "i0" });
    f.event({
      type: "response.created",
      response: { id: "r1", metadata: { voiceItem: "i0" } },
    });
    expect(f.audio.muted).toBe(false);
    f.observe({ type: "phase", state: "responding" });
    await vi.waitFor(() => expect(f.voice.state()).toBe("responding"));
    await f.voice.stopAndSpeak();
    expect(f.audio.muted).toBe(true);
    expect(f.track.enabled).toBe(true);
    expect(f.voice.state()).toBe("recording");
    expect(
      f.request.mock.calls.some(([url]) => String(url).endsWith("/interrupt")),
    ).toBe(true);
    const commands = f.channel.send.mock.calls.map(
      ([text]) => JSON.parse(text).type,
    );
    expect(commands).toContain("input_audio_buffer.commit");
    expect(commands).toContain("response.cancel");
    expect(commands).toContain("output_audio_buffer.clear");
    f.event({
      type: "conversation.item.input_audio_transcription.completed",
      item_id: "i1",
      transcript: "Private speech remains unwired",
    });
    expect(f.receive).not.toHaveBeenCalled();
  });

  it("starts muted and never opens playback for an unassociated or stale native response", async () => {
    const f = setup();
    await f.start();
    f.channel.onopen?.();
    expect(f.audio.muted).toBe(true);
    expect(f.track.enabled).toBe(false);
    f.event({ type: "response.created", response: { id: "unsolicited" } });
    expect(f.audio.muted).toBe(true);
    f.voice.speak();
    f.voice.submit();
    f.event({ type: "input_audio_buffer.committed", item_id: "current" });
    f.event({
      type: "response.created",
      response: { id: "old", metadata: { voiceItem: "previous" } },
    });
    expect(f.audio.muted).toBe(true);
    f.event({
      type: "response.created",
      response: { id: "valid", metadata: { voiceItem: "current" } },
    });
    expect(f.audio.muted).toBe(false);
    expect(
      f.channel.send.mock.calls.some(
        ([value]) => JSON.parse(value).type === "response.create",
      ),
    ).toBe(false);
  });

  it("honors typed admission cooldowns without retrying or reopening the microphone automatically", async () => {
    vi.useFakeTimers();
    const f = setup();
    f.request.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ code: "rate_limited", retryAfterSeconds: 60 }),
        {
          status: 429,
          headers: { "content-type": "application/json", "Retry-After": "60" },
        },
      ),
    );
    await f.start();
    expect(f.voice.problem()?.code).toBe("rate_limited");
    expect(f.voice.retryAt()).toBe(Date.now() + 60_000);
    expect(f.voice.state()).toBe("off");
    expect(f.track.stop).toHaveBeenCalledOnce();
    await f.start();
    expect(f.media.microphone).toHaveBeenCalledOnce();
    expect(f.request).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(f.voice.retryAt()).toBeNull();
    expect(f.media.microphone).toHaveBeenCalledOnce();
    expect(f.request).toHaveBeenCalledOnce();
    await f.start();
    expect(f.media.microphone).toHaveBeenCalledTimes(2);
    expect(f.voice.problem()).toBeNull();
  });

  it("uses a bounded Retry-After header when an older admission response lacks typed metadata", async () => {
    const f = setup();
    const now = Date.now();
    f.request.mockResolvedValueOnce(
      new Response("{}", { status: 429, headers: { "Retry-After": "30" } }),
    );
    await f.start();
    expect(f.voice.problem()?.code).toBe("capacity");
    expect(f.voice.retryAt()).toBeGreaterThanOrEqual(now + 30_000);
    expect(f.voice.retryAt()).toBeLessThanOrEqual(Date.now() + 30_000);
  });

  it("shows an incomplete-answer warning without closing healthy native audio or replaying generation", async () => {
    const f = setup();
    await f.start();
    f.channel.onopen?.();
    f.voice.speak();
    f.voice.submit();
    f.event({ type: "input_audio_buffer.committed", item_id: "current" });
    f.event({
      type: "response.created",
      response: { id: "r1", metadata: { voiceItem: "current" } },
    });
    f.event({
      type: "response.done",
      response: { id: "r1", status: "incomplete" },
    });
    f.observe({ type: "phase", state: "listening" });
    f.observe({ type: "voice_warning", code: "output_limit" });
    await vi.waitFor(() =>
      expect(f.voice.problem()?.code).toBe("output_limit"),
    );
    expect(f.voice.problem()?.severity).toBe("warning");
    expect(f.voice.state()).toBe("listening");
    expect(f.track.stop).not.toHaveBeenCalled();
    expect(f.request).toHaveBeenCalledTimes(2);
    expect(f.receive).not.toHaveBeenCalled();
    expect(
      f.channel.send.mock.calls.some(
        ([value]) => JSON.parse(value).type === "response.create",
      ),
    ).toBe(false);
    f.voice.speak();
    expect(f.voice.state()).toBe("recording");
    expect(f.voice.problem()).toBeNull();
  });

  it.each([
    "typed",
    "eof",
  ])("shows %s observation failure once and reconciles closure instead of silently ending", async (kind) => {
    const f = setup();
    await f.start();
    f.channel.onopen?.();
    if (kind === "typed")
      f.observe({ type: "voice_error", code: "provider_error" });
    else f.eof();
    await vi.waitFor(() => expect(f.voice.closed()).toBe(1));
    expect(f.voice.problem()?.code).toBe(
      kind === "typed" ? "provider_error" : "connection_lost",
    );
    expect(f.voice.state()).toBe("off");
    expect(f.track.stop).toHaveBeenCalledOnce();
    expect(f.media.microphone).toHaveBeenCalledOnce();
    expect(f.request).toHaveBeenCalledTimes(3);
  });

  it.each([
    { name: "NotAllowedError", code: "microphone_denied" },
    { name: "NotFoundError", code: "microphone_unavailable" },
  ])("distinguishes $code without exposing browser diagnostics", async ({
    name,
    code,
  }) => {
    const f = setup();
    f.media.microphone.mockRejectedValueOnce(
      new DOMException("Private device details", name),
    );
    await f.start();
    expect(f.voice.problem()?.code).toBe(code);
    expect(JSON.stringify(f.voice.problem())).not.toContain("Private device");
    expect(f.request).not.toHaveBeenCalled();
  });

  it.each([
    "end",
    "owner",
    "destroy",
    "device",
    "network",
  ])("stops every media resource on %s and suppresses late events", async (reason) => {
    const f = setup();
    await f.start();
    f.channel.onopen?.();
    const late = f.channel.onmessage;
    if (reason === "end") f.voice.end();
    if (reason === "owner")
      f.credentials.accept({ ...principal, userId: "other" }, "other-token");
    if (reason === "destroy") TestBed.resetTestingModule();
    if (reason === "device") f.track.dispatchEvent(new Event("ended"));
    if (reason === "network") {
      f.peer.connectionState = "failed";
      f.peer.onconnectionstatechange?.();
    }
    expect(f.track.stop).toHaveBeenCalledOnce();
    expect(f.audio.pause).toHaveBeenCalledOnce();
    expect(f.peer.close).toHaveBeenCalledOnce();
    late?.({
      data: JSON.stringify({
        type: "conversation.item.input_audio_transcription.completed",
        item_id: "i1",
        transcript: "Private late text",
      }),
    });
    expect(f.receive).not.toHaveBeenCalled();
    expect(f.voice.state()).toBe("off");
  });

  it("stops a microphone whose permission resolves after End", async () => {
    const f = setup();
    const permission = deferred<typeof f.microphone>();
    f.media.microphone.mockReturnValueOnce(permission.promise);
    const started = f.start();
    f.voice.end();
    permission.resolve(f.microphone);
    await started;
    expect(f.track.stop).toHaveBeenCalledOnce();
    expect(f.peer.addTrack).not.toHaveBeenCalled();
    expect(f.request).not.toHaveBeenCalled();
  });

  it("honors the pre-existing startup cancellation signal before and during microphone permission", async () => {
    const f = setup();
    const cancelled = new AbortController();
    cancelled.abort();
    await f.voice.start(
      f.owner,
      "00000000-0000-4000-8000-000000000001",
      f.receive,
      cancelled.signal,
    );
    expect(f.media.microphone).not.toHaveBeenCalled();
    const permission = deferred<typeof f.microphone>();
    f.media.microphone.mockReturnValueOnce(permission.promise);
    const startup = new AbortController();
    const started = f.voice.start(
      f.owner,
      "00000000-0000-4000-8000-000000000001",
      f.receive,
      startup.signal,
    );
    startup.abort();
    permission.resolve(f.microphone);
    await started;
    expect(f.track.stop).toHaveBeenCalledOnce();
    expect(f.peer.addTrack).not.toHaveBeenCalled();
    expect(f.request).not.toHaveBeenCalled();
  });

  it("ends capture when the tab is hidden and offers explicit playback recovery instead of silent failure", async () => {
    const f = setup();
    await f.start();
    f.channel.onopen?.();
    f.audio.play.mockRejectedValueOnce(new Error("Autoplay denied"));
    f.voice.play();
    await Promise.resolve();
    await Promise.resolve();
    expect(f.voice.playbackBlocked()).toBe(true);
    f.voice.play();
    await Promise.resolve();
    expect(f.voice.playbackBlocked()).toBe(false);
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(f.track.stop).toHaveBeenCalledOnce();
    expect(f.voice.state()).toBe("off");
  });

  it("sanitizes unknown setup failures and ends idle capture without reconnect", async () => {
    const f = setup();
    f.media.microphone.mockRejectedValueOnce(
      new Error("Vendor/private diagnostics"),
    );
    await f.start();
    expect(f.voice.problem()?.code).toBe("setup_failed");
    expect(JSON.stringify(f.voice.problem())).not.toContain("Vendor");
    await vi.waitFor(() => expect(f.voice.stopping()).toBe(false));
    vi.useFakeTimers();
    await f.start();
    f.channel.onopen?.();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(f.track.stop).toHaveBeenCalledOnce();
    expect(f.media.microphone).toHaveBeenCalledTimes(2);
  });
});
