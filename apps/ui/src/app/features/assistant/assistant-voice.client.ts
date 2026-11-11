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
  AssistantVoiceSessionSchema,
} from "@lazyfinance/contracts";
import { z } from "zod";
import {
  AuthCredentials,
  type VerifiedCredentials,
} from "../../core/auth/auth-credentials";
import { RPC_FETCH } from "../../core/rpc/rpc-client";
import { API_URL } from "../../tokens/api-url";

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
  transcript: z.string().max(16_000).optional(),
  delta: z.string().max(16_000).optional(),
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
const captionEvents = new Set([
  "error",
  "input_audio_buffer.speech_started",
  "input_audio_buffer.speech_stopped",
  "conversation.item.input_audio_transcription.delta",
  "conversation.item.input_audio_transcription.completed",
  "conversation.item.input_audio_transcription.failed",
  "response.created",
  "response.done",
  "response.output_audio_transcript.delta",
]);
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
  inputs: Map<string, { order: number; partial: string; text?: string }>;
  outputId?: string;
  responding?: boolean;
  turnId?: string;
}

/** Native conversational audio. Captions never submit a text turn or execute a tool. */
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
  readonly error = signal("");
  readonly inputTranscript = signal("");
  readonly inputTranscripts = signal<
    { id: string; order: number; text: string }[]
  >([]);
  readonly outputTranscript = signal("");
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
    if (!response.ok) throw new Error("Voice unavailable");
    return response;
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
      !this.supported ||
      owner.signal.aborted ||
      startupSignal?.aborted ||
      document.hidden
    )
      return;
    this.error.set("");
    this.inputTranscript.set("");
    this.inputTranscripts.set([]);
    this.outputTranscript.set("");
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
        inputs: new Map(),
      };
    } catch {
      this.state.set("off");
      this.error.set(
        "No pudimos preparar el audio. Puedes continuar por texto.",
      );
      return;
    }
    this.run = run;
    const current = () =>
      this.run === run &&
      !run.controller.signal.aborted &&
      !startupSignal?.aborted &&
      !document.hidden &&
      !owner.signal.aborted;
    const fail = () => {
      if (!current()) return;
      this.end();
      this.error.set(
        "La voz se interrumpió. Puedes continuar por texto; no se reenviará nada automáticamente.",
      );
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
    navigator.mediaDevices?.addEventListener("devicechange", fail, {
      signal: run.controller.signal,
    });
    const activity = () => {
      clearTimeout(run.idle);
      run.idle = setTimeout(() => {
        if (current()) this.end();
      }, 60_000);
    };
    run.timeout = setTimeout(fail, 15_000);
    try {
      const microphone = await this.media.microphone();
      if (!current()) {
        for (const track of microphone.getTracks()) track.stop();
        return;
      }
      run.microphone = microphone;
      for (const track of microphone.getAudioTracks()) {
        track.addEventListener("ended", fail, {
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
      channel.onclose = fail;
      channel.onerror = fail;
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
            !captionEvents.has(z.object({ type: z.string() }).parse(value).type)
          )
            return;
          const event = eventSchema.parse(value);
          if (
            event.type === "error" &&
            event.error?.code === "response_cancel_not_active"
          )
            return;
          if (
            event.type === "error" ||
            event.type === "conversation.item.input_audio_transcription.failed"
          ) {
            fail();
            return;
          }
          if (this.state() === "muted") return;
          if (event.type === "input_audio_buffer.speech_started") {
            if (!event.item_id || run.seen.has(event.item_id)) return;
            if (run.seen.size >= 24) {
              fail();
              return;
            }
            run.seen.add(event.item_id);
            run.inputs.set(event.item_id, {
              order: run.seen.size,
              partial: "",
            });
            activity();
            this.interrupt();
            interrupt();
            this.inputTranscript.set("");
            this.outputTranscript.set("");
            this.state.set("listening");
            run.inputId = event.item_id;
          }
          if (event.type === "input_audio_buffer.speech_stopped")
            this.state.set("querying");
          if (
            event.type ===
              "conversation.item.input_audio_transcription.delta" &&
            event.item_id &&
            run.inputs.has(event.item_id) &&
            event.delta
          ) {
            const item = run.inputs.get(event.item_id);
            if (item) {
              item.partial = (item.partial + event.delta).slice(0, 2000);
              if (event.item_id === run.inputId)
                this.inputTranscript.set(item.partial);
            }
          }
          if (
            event.type ===
              "conversation.item.input_audio_transcription.completed" &&
            event.transcript &&
            event.item_id &&
            run.inputs.has(event.item_id)
          ) {
            if (event.transcript.length > 2000) {
              fail();
              return;
            }
            const item = run.inputs.get(event.item_id);
            if (!item || item.text !== undefined) return;
            item.text = event.transcript;
            activity();
            // Record every completed item immediately, including later items
            // waiting for an earlier asynchronous transcription to settle.
            this.inputTranscripts.update((items) =>
              [
                ...items,
                {
                  id: event.item_id ?? "",
                  order: item.order,
                  text: event.transcript ?? "",
                },
              ].sort((a, b) => a.order - b.order),
            );
            const ready: string[] = [];
            for (const [id, pending] of run.inputs) {
              if (pending.text === undefined) break;
              ready.push(pending.text);
              run.inputs.delete(id);
            }
            for (const text of ready) {
              if (!current()) break;
              this.inputTranscript.set(text);
            }
          }
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
              !["completed", "cancelled"].includes(event.response?.status ?? "")
            ) {
              fail();
              return;
            }
          }
          if (
            event.type === "response.output_audio_transcript.delta" &&
            run.outputId &&
            event.delta &&
            event.response_id === run.outputId &&
            run.outputId
          )
            this.outputTranscript.update((text) =>
              (text + event.delta).slice(0, 16_000),
            );
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
        .catch(fail);
      await run.peer.setRemoteDescription({ type: "answer", sdp: session.sdp });
    } catch {
      fail();
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
          receive(event);
          if (event.type === "error") throw new Error("Unconfirmed voice turn");
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
    this.run.inputs.clear();
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

  end(clearTranscripts = false) {
    const run = this.run;
    this.run = undefined;
    this.state.set("off");
    this.playbackBlocked.set(false);
    if (clearTranscripts) {
      this.error.set("");
      this.inputTranscript.set("");
      this.inputTranscripts.set([]);
      this.outputTranscript.set("");
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
    return this.release(run);
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
