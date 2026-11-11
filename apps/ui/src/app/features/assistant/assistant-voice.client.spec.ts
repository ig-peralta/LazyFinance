import { TestBed } from "@angular/core/testing";
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
  const request = vi.fn<typeof fetch>(async (url, options) =>
    String(url).endsWith("/events")
      ? new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              options?.signal?.addEventListener(
                "abort",
                () => controller.close(),
                { once: true },
              );
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
  const transcript = vi.fn(),
    interrupt = vi.fn();
  const start = () =>
    voice.start(
      owner,
      "00000000-0000-4000-8000-000000000001",
      transcript,
      interrupt,
    );
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
    transcript,
    interrupt,
    start,
    event,
  };
}

describe("continuous live voice media and session lifetimes", () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("keeps delayed captions in speech order without submitting any transcription as a text turn", async () => {
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
    expect(f.transcript).not.toHaveBeenCalled();
    expect(f.voice.inputTranscripts().map((item) => item.text)).toEqual([
      "Segunda pregunta",
    ]);
    f.event({
      type: "conversation.item.input_audio_transcription.completed",
      item_id: "a",
      transcript: "Primera pregunta",
    });
    expect(f.transcript).not.toHaveBeenCalled();
    expect(f.voice.inputTranscripts().map((item) => item.text)).toEqual([
      "Primera pregunta",
      "Segunda pregunta",
    ]);
    f.event({
      type: "conversation.item.input_audio_transcription.completed",
      item_id: "a",
      transcript: "Duplicada",
    });
    expect(f.transcript).not.toHaveBeenCalled();
  });

  it("retains completed questions for explicit reconciliation when delivery ends/interruption blocks the conversation", async () => {
    const f = setup();
    await f.start();
    f.channel.onopen?.();
    f.event({ type: "input_audio_buffer.speech_started", item_id: "a" });
    f.event({ type: "input_audio_buffer.speech_started", item_id: "b" });
    f.event({
      type: "conversation.item.input_audio_transcription.completed",
      item_id: "b",
      transcript: "Segunda pendiente",
    });
    f.event({
      type: "conversation.item.input_audio_transcription.completed",
      item_id: "a",
      transcript: "Primera interrumpida",
    });
    expect(f.transcript).not.toHaveBeenCalled();
    f.voice.end();
    expect(f.voice.inputTranscripts().map((item) => item.text)).toEqual([
      "Primera interrumpida",
      "Segunda pendiente",
    ]);
    f.credentials.clear();
    // A detached run no longer owns an abort listener; component owner clearing
    // invokes end(true), as does component destruction.
    f.voice.end(true);
    expect(f.voice.inputTranscripts()).toEqual([]);
  });

  it("invalidates pending transcription items on mute and bounds the collection", async () => {
    const f = setup();
    await f.start();
    f.channel.onopen?.();
    f.event({ type: "input_audio_buffer.speech_started", item_id: "a" });
    f.event({ type: "input_audio_buffer.speech_started", item_id: "b" });
    f.voice.mute();
    f.voice.mute();
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
    expect(f.transcript).not.toHaveBeenCalled();
    for (let index = 2; index <= 24; index++)
      f.event({
        type: "input_audio_buffer.speech_started",
        item_id: `item-${index}`,
      });
    expect(f.voice.state()).toBe("off");
    expect(f.track.stop).toHaveBeenCalledOnce();
  });

  it("does not capture until Start, streams a microphone track and handles completed transcripts once", async () => {
    const f = setup();
    expect(f.media.microphone).not.toHaveBeenCalled();
    await f.start();
    f.channel.onopen?.();
    expect(f.peer.addTrack).toHaveBeenCalledWith(f.track, f.microphone);
    expect(f.peer.setRemoteDescription).toHaveBeenCalledWith({
      type: "answer",
      sdp: "v=0\r\nanswer",
    });
    f.event({ type: "input_audio_buffer.speech_started", item_id: "i1" });
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
    expect(f.transcript).not.toHaveBeenCalled();
    expect(f.request).toHaveBeenCalledTimes(2); // SDP and authenticated observations, never approval.
    expect(f.voice.inputTranscript()).toBe("Sí, aprueba");
  });

  it("mutes tracks, cancels/clears output on barge-in and rejects obsolete audio transcript deltas", async () => {
    const f = setup();
    await f.start();
    f.channel.onopen?.();
    f.event({ type: "input_audio_buffer.speech_started", item_id: "i0" });
    f.interrupt.mockClear();
    f.event({
      type: "response.created",
      response: { id: "r1", metadata: { voiceItem: "i0" } },
    });
    f.event({
      type: "response.output_audio_transcript.delta",
      response_id: "r1",
      delta: "Respuesta",
    });
    expect(f.voice.outputTranscript()).toBe("Respuesta");
    f.event({ type: "input_audio_buffer.speech_started", item_id: "i1" });
    expect(f.audio.muted).toBe(true);
    expect(f.interrupt).toHaveBeenCalledOnce();
    const commands = f.channel.send.mock.calls.map(
      ([text]) => JSON.parse(text).type,
    );
    expect(commands).toContain("response.cancel");
    expect(commands).toContain("output_audio_buffer.clear");
    f.event({
      type: "response.output_audio_transcript.delta",
      response_id: "r1",
      delta: "Obsoleto",
    });
    expect(f.voice.outputTranscript()).not.toContain("Obsoleto");
    f.voice.mute();
    expect(f.track.enabled).toBe(false);
    f.voice.mute();
    expect(f.track.enabled).toBe(true);
    f.event({
      type: "conversation.item.input_audio_transcription.completed",
      item_id: "i1",
      transcript: "Anterior al silencio",
    });
    expect(f.transcript).not.toHaveBeenCalled();
  });

  it("starts muted and never opens playback for an unassociated or stale native response", async () => {
    const f = setup();
    await f.start();
    f.channel.onopen?.();
    expect(f.audio.muted).toBe(true);
    f.event({ type: "response.created", response: { id: "unsolicited" } });
    expect(f.audio.muted).toBe(true);
    f.event({ type: "input_audio_buffer.speech_started", item_id: "current" });
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
    expect(f.transcript).not.toHaveBeenCalled();
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
      f.transcript,
      f.interrupt,
      cancelled.signal,
    );
    expect(f.media.microphone).not.toHaveBeenCalled();
    const permission = deferred<typeof f.microphone>();
    f.media.microphone.mockReturnValueOnce(permission.promise);
    const startup = new AbortController();
    const started = f.voice.start(
      f.owner,
      "00000000-0000-4000-8000-000000000001",
      f.transcript,
      f.interrupt,
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

  it("offers sanitized text fallback on denied permission and ends idle capture without reconnect", async () => {
    const f = setup();
    f.media.microphone.mockRejectedValueOnce(
      new Error("Vendor/private diagnostics"),
    );
    await f.start();
    expect(f.voice.error()).toContain("continuar por texto");
    expect(f.voice.error()).not.toContain("Vendor");
    vi.useFakeTimers();
    await f.start();
    f.channel.onopen?.();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(f.track.stop).toHaveBeenCalledOnce();
    expect(f.media.microphone).toHaveBeenCalledTimes(2);
  });
});
