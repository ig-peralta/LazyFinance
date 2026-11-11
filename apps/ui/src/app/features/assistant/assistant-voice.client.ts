import {
  DestroyRef,
  Injectable,
  InjectionToken,
  inject,
  signal,
} from "@angular/core";
import {
  type AssistantEvent,
  AssistantVoiceConfigurationSchema,
  AssistantVoiceEventSchema,
  AssistantVoiceProblemSchema,
  AssistantVoiceSessionSchema,
} from "@lazyfinance/contracts";
import { z } from "zod";
import {
  AuthCredentials,
  type VerifiedCredentials,
} from "../../core/auth/auth-credentials";
import { RPC_FETCH } from "../../core/rpc/rpc-client";
import { API_URL } from "../../tokens/api-url";
import {
  type VoiceProblem,
  type VoiceProblemCode,
  voiceProblem,
} from "./assistant-voice-problem";

export const VOICE_MEDIA = new InjectionToken("VOICE_MEDIA", {
  providedIn: "root",
  factory: () => ({
    supported: () =>
      typeof RTCPeerConnection !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia,
    microphone: () =>
      navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      }),
    peer: () => new RTCPeerConnection(),
    audio: () => new Audio(),
  }),
});
const eventSchema = z.object({
  type: z.string(),
  item_id: z.string().optional(),
  response_id: z.string().optional(),
  error: z.object({ code: z.string().optional() }).optional(),
  response: z
    .object({
      id: z.string(),
      status: z.string().optional(),
      metadata: z.object({ voiceItem: z.string().optional() }).nullish(),
    })
    .optional(),
});
// Input transcription/caption collection is intentionally unwired. The native
// media channel is used only for audio activity, playback gating and controls.
const mediaEvents = new Set([
  "error",
  "input_audio_buffer.speech_started",
  "input_audio_buffer.speech_stopped",
  "response.created",
  "response.done",
]);
class VoiceRequestError extends Error {
  constructor(
    readonly code: VoiceProblemCode,
    readonly retryAfterSeconds?: number,
  ) {
    super(code);
  }
}
interface VoiceRun {
  owner: VerifiedCredentials;
  controller: AbortController;
  peer: RTCPeerConnection;
  audio: HTMLAudioElement;
  microphone?: MediaStream;
  channel?: RTCDataChannel;
  session?: string;
  timeout?: ReturnType<typeof setTimeout>;
  idle?: ReturnType<typeof setTimeout>;
  seen: Set<string>;
  inputId?: string;
  outputId?: string;
  responding?: boolean;
  turnId?: string;
}

/** Native conversational audio without a separate transcription service or captions. */
@Injectable()
export class AssistantVoiceClient {
  private readonly credentials = inject(AuthCredentials);
  private readonly fetch = inject(RPC_FETCH);
  private readonly media = inject(VOICE_MEDIA);
  private readonly api =
    `${inject(API_URL).replace(/\/$/, "")}/assistant/voice`;
  private run: VoiceRun | undefined;
  readonly state = signal<
    "off" | "connecting" | "listening" | "querying" | "responding" | "muted"
  >("off");
  readonly problem = signal<VoiceProblem | null>(null);
  readonly retryAt = signal<number | null>(null);
  readonly stopping = signal(false);
  readonly closed = signal(0);
  private closeEpoch = 0;
  private retryTimer?: ReturnType<typeof setTimeout>;
  readonly playbackBlocked = signal(false);
  readonly supported = this.media.supported();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.end(true));
  }

  async configuration(owner: VerifiedCredentials, signal: AbortSignal) {
    const response = await this.request(owner, "configuration", { signal });
    return AssistantVoiceConfigurationSchema.parse(await response.json());
  }

  private async request(
    owner: VerifiedCredentials,
    path: string,
    options: RequestInit,
  ) {
    const response = await this.fetch(`${this.api}/${path}`, {
      ...options,
      cache: "no-store",
      credentials: "omit",
      headers: {
        authorization: `Bearer ${owner.token}`,
        "content-type": "application/json",
      },
    });
    if (response.status === 401) this.credentials.expire(owner);
    if (!response.ok) {
      const parsed = AssistantVoiceProblemSchema.safeParse(
        await response.json().catch(() => null),
      );
      const header = Number(response.headers.get("Retry-After"));
      const retry = parsed.success ? parsed.data.retryAfterSeconds : undefined;
      throw new VoiceRequestError(
        parsed.success
          ? parsed.data.code
          : response.status === 429
            ? "capacity"
            : response.status === 503
              ? "unavailable"
              : "setup_failed",
        retry ??
          (Number.isInteger(header) && header > 0 && header <= 3600
            ? header
            : undefined),
      );
    }
    return response;
  }

  private showProblem(code: VoiceProblemCode, retryAfterSeconds?: number) {
    const retryAt = retryAfterSeconds
      ? Date.now() + retryAfterSeconds * 1000
      : undefined;
    this.problem.set(voiceProblem(code, retryAt));
    if (retryAt) {
      clearTimeout(this.retryTimer);
      this.retryAt.set(retryAt);
      this.retryTimer = setTimeout(
        () => this.retryAt.set(null),
        Math.max(1, retryAt - Date.now()),
      );
    }
  }

  clearProblem() {
    this.problem.set(null);
  }

  async start(
    owner: VerifiedCredentials,
    conversationId: string,
    receive: (event: AssistantEvent) => void,
    interrupt: () => void,
    startupSignal?: AbortSignal,
  ) {
    if (
      this.run ||
      this.stopping() ||
      !this.supported ||
      owner.signal.aborted ||
      startupSignal?.aborted ||
      (this.retryAt() ?? 0) > Date.now() ||
      document.hidden
    )
      return;
    this.problem.set(null);
    this.playbackBlocked.set(false);
    this.state.set("connecting");
    let run: VoiceRun;
    try {
      const audio = this.media.audio();
      audio.muted = true;
      run = {
        owner,
        controller: new AbortController(),
        peer: this.media.peer(),
        audio,
        seen: new Set(),
      };
    } catch {
      this.state.set("off");
      this.showProblem("setup_failed");
      return;
    }
    this.run = run;
    const current = () =>
      this.run === run &&
      !run.controller.signal.aborted &&
      !startupSignal?.aborted &&
      !document.hidden &&
      !owner.signal.aborted;
    const fail = (
      code: VoiceProblemCode = "connection_lost",
      retryAfterSeconds?: number,
    ) => {
      if (!current()) return;
      this.end();
      this.showProblem(code, retryAfterSeconds);
    };
    owner.signal.addEventListener("abort", () => this.end(true), {
      once: true,
      signal: run.controller.signal,
    });
    startupSignal?.addEventListener("abort", () => this.end(), {
      once: true,
      signal: run.controller.signal,
    });
    document.addEventListener(
      "visibilitychange",
      () => {
        if (document.hidden) this.end();
      },
      { signal: run.controller.signal },
    );
    navigator.mediaDevices?.addEventListener(
      "devicechange",
      () => fail("microphone_unavailable"),
      {
        signal: run.controller.signal,
      },
    );
    const activity = () => {
      clearTimeout(run.idle);
      run.idle = setTimeout(() => {
        if (current()) this.end();
      }, 60_000);
    };
    run.timeout = setTimeout(() => fail("setup_failed"), 15_000);
    try {
      const microphone = await this.media.microphone();
      if (!current()) {
        for (const track of microphone.getTracks()) track.stop();
        return;
      }
      run.microphone = microphone;
      for (const track of microphone.getAudioTracks()) {
        track.addEventListener("ended", () => fail("microphone_unavailable"), {
          signal: run.controller.signal,
        });
        run.peer.addTrack(track, microphone);
      }
      run.peer.ontrack = (event) => {
        if (!current()) return;
        run.audio.srcObject = new MediaStream([event.track]);
        void run.audio.play().catch(() => {
          if (current()) this.playbackBlocked.set(true);
        });
      };
      run.peer.onconnectionstatechange = () => {
        if (
          ["failed", "disconnected", "closed"].includes(
            run.peer.connectionState,
          )
        )
          fail();
      };
      const channel = run.peer.createDataChannel("oai-events");
      run.channel = channel;
      channel.onclose = () => fail();
      channel.onerror = () => fail();
      channel.onopen = () => {
        if (!current()) return;
        clearTimeout(run.timeout);
        run.timeout = setTimeout(() => {
          if (current()) this.end();
        }, 300_000);
        this.state.set("listening");
        activity();
      };
      channel.onmessage = ({ data }) => {
        if (!current() || typeof data !== "string" || data.length > 32_000)
          return;
        try {
          const value: unknown = JSON.parse(data);
          if (
            !mediaEvents.has(z.object({ type: z.string() }).parse(value).type)
          )
            return;
          const event = eventSchema.parse(value);
          if (
            event.type === "error" &&
            event.error?.code === "response_cancel_not_active"
          )
            return;
          if (event.type === "error") {
            fail("provider_error");
            return;
          }
          if (this.state() === "muted") return;
          if (event.type === "input_audio_buffer.speech_started") {
            this.problem.set(null);
            if (!event.item_id || run.seen.has(event.item_id)) return;
            if (run.seen.size >= 24) {
              fail();
              return;
            }
            run.seen.add(event.item_id);
            activity();
            this.interrupt();
            interrupt();
            this.state.set("listening");
            run.inputId = event.item_id;
          }
          if (event.type === "input_audio_buffer.speech_stopped")
            this.state.set("querying");
          if (
            event.type === "response.created" &&
            event.response &&
            run.inputId &&
            event.response?.metadata?.voiceItem === run.inputId
          ) {
            run.outputId = event.response.id;
            run.responding = true;
            run.audio.muted = false;
          }
          if (
            event.type === "response.done" &&
            run.outputId &&
            event.response?.id === run.outputId
          ) {
            run.responding = false;
            if (
              !["completed", "cancelled", "incomplete", "failed"].includes(
                event.response?.status ?? "",
              )
            ) {
              fail();
              return;
            }
          }
        } catch {
          fail();
        }
      };
      const offer = await run.peer.createOffer();
      if (!current()) return;
      await run.peer.setLocalDescription(offer);
      if (!current()) return;
      const response = await this.request(owner, "sessions", {
        method: "POST",
        body: JSON.stringify({ conversationId, sdp: offer.sdp }),
        signal: AbortSignal.any([owner.signal, run.controller.signal]),
      });
      const session = AssistantVoiceSessionSchema.parse(await response.json());
      run.session = session.id;
      if (!current()) {
        void this.release(run);
        return;
      }
      void this.listen(run, conversationId, receive)
        .then(() => {
          if (current()) fail();
        })
        .catch((error: unknown) => {
          if (error instanceof VoiceRequestError)
            fail(error.code, error.retryAfterSeconds);
          else fail();
        });
      await run.peer.setRemoteDescription({ type: "answer", sdp: session.sdp });
    } catch (error) {
      const name =
        error instanceof Error || error instanceof DOMException
          ? error.name
          : "";
      if (error instanceof VoiceRequestError)
        fail(error.code, error.retryAfterSeconds);
      else if (["NotAllowedError", "PermissionDeniedError"].includes(name))
        fail("microphone_denied");
      else if (
        ["NotFoundError", "NotReadableError", "OverconstrainedError"].includes(
          name,
        )
      )
        fail("microphone_unavailable");
      else fail(run.session ? "connection_lost" : "setup_failed");
    }
  }

  private async listen(
    run: VoiceRun,
    conversationId: string,
    receive: (event: AssistantEvent) => void,
  ) {
    const response = await this.request(run.owner, "events", {
      method: "POST",
      body: JSON.stringify({ id: run.session }),
      signal: AbortSignal.any([run.owner.signal, run.controller.signal]),
    });
    if (
      !response.body ||
      !response.headers.get("content-type")?.startsWith("application/x-ndjson")
    )
      throw new Error("Invalid voice stream");
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let buffer = "",
      bytes = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > 10_000_000) throw new Error("Voice stream limit");
        buffer += decoder.decode(chunk.value, { stream: true });
        let end = buffer.indexOf("\n");
        while (end >= 0) {
          const line = buffer.slice(0, end);
          buffer = buffer.slice(end + 1);
          end = buffer.indexOf("\n");
          if (!line.trim()) continue;
          if (
            this.run !== run ||
            run.controller.signal.aborted ||
            run.owner.signal.aborted
          )
            return;
          const event = AssistantVoiceEventSchema.parse(JSON.parse(line));
          // Speech text is intentionally unwired, including older server deltas.
          if (event.type === "delta") continue;
          if (event.type === "voice_warning") {
            this.showProblem(event.code);
            continue;
          }
          if (event.type === "voice_error")
            throw new VoiceRequestError(event.code, event.retryAfterSeconds);
          if (event.type === "phase") {
            if (this.state() !== "muted") this.state.set(event.state);
            continue;
          }
          if (event.type === "turn") run.turnId = event.turn.id;
          if (
            (event.type === "done" && event.turn.id !== run.turnId) ||
            (event.type === "action" &&
              (event.action.conversationId !== conversationId ||
                event.action.turnId !== run.turnId ||
                event.action.status !== "proposed"))
          )
            throw new Error("Foreign voice event");
          if (
            event.type === "action_updated" &&
            (event.action.conversationId !== conversationId ||
              !event.action.turnId ||
              event.action.origin !== "assistant")
          )
            throw new Error("Foreign voice correction");
          if (event.type === "error")
            throw new VoiceRequestError("turn_unconfirmed");
          receive(event);
        }
        if (buffer.length > 500_000) throw new Error("Voice event limit");
      }
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }

  private send(value: unknown) {
    const channel = this.run?.channel;
    if (channel?.readyState === "open") channel.send(JSON.stringify(value));
  }

  interrupt() {
    const run = this.run;
    if (!run) return;
    run.audio.muted = true;
    const hadOutput = !!run.outputId;
    run.outputId = undefined;
    if (run.responding) {
      this.send({ type: "response.cancel" });
      run.responding = false;
    }
    if (hadOutput) this.send({ type: "output_audio_buffer.clear" });
  }

  mute() {
    if (!this.run || this.state() === "connecting") return;
    const muted = this.state() !== "muted";
    this.run.inputId = undefined;
    for (const track of this.run.microphone?.getTracks() ?? [])
      track.enabled = !muted;
    this.interrupt();
    this.send({ type: "input_audio_buffer.clear" });
    this.state.set(muted ? "muted" : "listening");
  }

  play() {
    const run = this.run;
    if (!run) return;
    void run.audio
      .play()
      .then(() => {
        if (this.run === run && !run.owner.signal.aborted)
          this.playbackBlocked.set(false);
      })
      .catch(() => {
        if (this.run === run && !run.owner.signal.aborted)
          this.playbackBlocked.set(true);
      });
  }

  end(clearState = false) {
    const run = this.run;
    this.run = undefined;
    this.state.set("off");
    this.playbackBlocked.set(false);
    if (clearState) {
      this.problem.set(null);
      clearTimeout(this.retryTimer);
      this.retryAt.set(null);
    }
    if (!run) return Promise.resolve();
    run.controller.abort();
    clearTimeout(run.timeout);
    clearTimeout(run.idle);
    for (const track of run.microphone?.getTracks() ?? []) track.stop();
    run.audio.muted = true;
    run.audio.pause();
    run.audio.srcObject = null;
    run.channel?.close();
    run.peer.close();
    const epoch = ++this.closeEpoch;
    this.stopping.set(true);
    return this.release(run).finally(() => {
      if (epoch === this.closeEpoch) this.stopping.set(false);
      this.closed.update((value) => value + 1);
    });
  }

  private async release(run: VoiceRun) {
    if (!run.session) return;
    try {
      await this.request(run.owner, "end", {
        method: "POST",
        body: JSON.stringify({ id: run.session }),
        keepalive: true,
        signal: AbortSignal.timeout(5_000),
      });
    } catch {
      /* Server duration/hangup bound remains authoritative. */
    }
  }
}
