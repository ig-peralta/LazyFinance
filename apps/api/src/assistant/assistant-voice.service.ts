import { createHash, randomUUID } from "node:crypto";
import {
  type AssistantVoiceEvent,
  type AssistantVoiceProblemCode,
  AssistantVoiceProblemSchema,
} from "@lazyfinance/contracts";
import {
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  ServiceUnavailableException,
} from "@nestjs/common";
import { EnvironmentService } from "../environment/environment.service";
import { AssistantService } from "./assistant.service";
import {
  AssistantVoiceRuntime,
  type RealtimeConversation,
  VOICE_MAX_OUTPUT_TOKENS,
} from "./assistant-voice-runtime";

export const VOICE_FETCH = Symbol("VOICE_FETCH");
const duration = 300_000;
interface VoiceLease {
  owner: string;
  conversationId: string;
  runtime?: RealtimeConversation;
  observing?: boolean;
  call?: string;
  timer?: ReturnType<typeof setTimeout>;
  initializing: boolean;
  stopRequested: boolean;
  termination?: Promise<boolean>;
  drainEpoch?: number;
  drainAttempts?: number;
}

/** Single-replica, bounded admission. Never exposes a provider credential. */
@Injectable()
export class AssistantVoiceService implements OnModuleDestroy {
  private readonly sessions = new Map<string, VoiceLease>();
  private readonly starts = new Map<string, number[]>();
  private readonly initializing = new Set<Promise<unknown>>();
  private draining = false;
  private drainEpoch = 0;
  private readonly logger = new Logger(AssistantVoiceService.name);

  constructor(
    private readonly environment: EnvironmentService,
    private readonly assistant: AssistantService,
    @Inject(VOICE_FETCH) private readonly request: typeof fetch,
    private readonly runtime: AssistantVoiceRuntime,
  ) {}

  configuration() {
    return {
      enabled: this.environment.get("ASSISTANT_VOICE_ENABLED") === "true",
    };
  }

  async start(
    owner: string,
    origin: string | undefined,
    input: { conversationId: string; sdp: string },
    signal: AbortSignal,
  ) {
    if (this.draining || !this.configuration().enabled)
      throw new ServiceUnavailableException("Voice unavailable");
    if (!origin || !this.environment.get("CORS_ORIGINS").includes(origin))
      throw new ForbiddenException();
    await this.assistant.requireConsent(owner);
    signal.throwIfAborted();
    const conversation = await this.assistant
      .conversations(owner)
      .get.query({ id: input.conversationId });
    if (conversation.mode !== "voice")
      throw new ForbiddenException("A separate voice conversation is required");
    signal.throwIfAborted();
    if (this.draining)
      throw new ServiceUnavailableException("Voice unavailable");
    const now = Date.now();
    for (const [key, times] of this.starts) {
      const recent = times.filter((time) => time > now - 3_600_000);
      if (recent.length) this.starts.set(key, recent);
      else this.starts.delete(key);
    }
    const recent = this.starts.get(owner) ?? [];
    if ([...this.sessions.values()].some((value) => value.owner === owner))
      this.reject("session_active", 409);
    if (
      this.sessions.size >= 4 ||
      (this.starts.size >= 10_000 && !this.starts.has(owner))
    )
      this.reject("capacity", 429, 30);
    const maxStarts =
      this.environment.get("ASSISTANT_VOICE_MAX_STARTS_PER_HOUR") ??
      (this.environment.get("NODE_ENV") === "production" ? 3 : 12);
    if (recent.length >= maxStarts)
      this.reject(
        "rate_limited",
        429,
        Math.min(
          3600,
          Math.max(1, Math.ceil((recent[0] + 3_600_000 - now) / 1000)),
        ),
      );
    const id = randomUUID();
    const lease: VoiceLease = {
      owner,
      conversationId: input.conversationId,
      initializing: true,
      stopRequested: false,
    };
    this.sessions.set(id, lease);
    this.starts.set(owner, [...recent, now]);
    const form = new FormData();
    form.set("sdp", input.sdp);
    form.set(
      "session",
      JSON.stringify({
        type: "realtime",
        model: this.environment.get("ASSISTANT_VOICE_MODEL"),
        instructions:
          "Espera la configuración del servidor. No respondas ni ejecutes acciones antes de recibirla.",
        tools: [],
        max_output_tokens: VOICE_MAX_OUTPUT_TOKENS,
        audio: {
          input: {
            // Input transcription is intentionally unwired to avoid a separate
            // paid speech-to-text call. Native audio drives the conversation.
            turn_detection: {
              type: "semantic_vad",
              eagerness: "low",
              create_response: false,
              interrupt_response: true,
            },
          },
          output: { voice: this.environment.get("ASSISTANT_VOICE_NAME") },
        },
      }),
    );
    const operation = this.initialize(owner, id, lease, form, signal, now);
    this.initializing.add(operation);
    try {
      return await operation;
    } finally {
      this.initializing.delete(operation);
    }
  }

  private reject(
    code: AssistantVoiceProblemCode,
    status: number,
    retryAfterSeconds?: number,
  ): never {
    const problem = AssistantVoiceProblemSchema.parse({
      code,
      retryAfterSeconds,
    });
    this.logger.warn(`Voice admission rejected: ${JSON.stringify(problem)}`);
    throw new HttpException(problem, status);
  }

  private async initialize(
    owner: string,
    id: string,
    lease: VoiceLease,
    form: FormData,
    signal: AbortSignal,
    now: number,
  ) {
    let phase = "provider_call";
    try {
      // Complete an uncertain initialization even after browser disconnect so that
      // a returned call ID can be hung up, rather than orphaning paid processing.
      const response = await this.request(
        "https://api.openai.com/v1/realtime/calls",
        {
          method: "POST",
          redirect: "error",
          headers: {
            authorization: `Bearer ${this.environment.get("ASSISTANT_VOICE_API_KEY")}`,
            "OpenAI-Safety-Identifier": createHash("sha256")
              .update(owner)
              .digest("hex"),
          },
          body: form,
          signal: AbortSignal.timeout(15_000),
        },
      );
      const location = response.headers.get("location");
      const call = location?.match(
        /\/realtime\/calls\/(rtc_[A-Za-z0-9_-]+)$/,
      )?.[1];
      if (!response.ok || !call) throw new Error("Voice initialization failed");
      lease.call = call;
      lease.initializing = false;
      lease.timer = setTimeout(
        () => {
          void this.end(owner, id);
        },
        Math.max(1, duration - (Date.now() - now)),
      );
      lease.timer.unref();
      const sdp = await this.readSdp(response);
      if (
        !sdp.startsWith("v=0") ||
        signal.aborted ||
        this.draining ||
        lease.stopRequested
      )
        throw new Error("Invalid or obsolete voice session");
      phase = "sideband_configuration";
      lease.runtime = await this.runtime.connect(
        owner,
        lease.conversationId,
        call,
      );
      if (signal.aborted || lease.stopRequested || this.draining)
        throw new Error("Voice initialization cancelled");
      return { id, sdp, expiresAt: new Date(now + duration).toISOString() };
    } catch {
      this.logger.warn(`Voice setup failed: phase=${phase}`);
      lease.initializing = false;
      await this.end(owner, id);
      throw new HttpException(
        {
          code: "setup_failed",
          message: "No pudimos iniciar la voz. Puedes continuar por texto.",
        },
        503,
      );
    }
  }

  async end(owner: string, id: string) {
    const lease = this.sessions.get(id);
    // An opaque foreign ID neither reveals nor terminates another owner's call.
    if (!lease || lease.owner !== owner) return;
    lease.stopRequested = true;
    clearTimeout(lease.timer);
    // Keep the lease until its in-flight initialization supplies the remote ID.
    if (lease.initializing) return;
    const closing = lease.runtime?.close();
    if (!lease.call) {
      this.sessions.delete(id);
      return;
    }
    const attempts = this.draining ? 3 : 1;
    for (let attempt = 0; attempt < attempts; attempt++) {
      if (this.draining) {
        if (lease.drainEpoch !== this.drainEpoch) {
          lease.drainEpoch = this.drainEpoch;
          lease.drainAttempts = 0;
        }
        if ((lease.drainAttempts ?? 0) >= 3) return;
        lease.drainAttempts = (lease.drainAttempts ?? 0) + 1;
      }
      if (await this.hangup(id, lease)) return closing;
    }
    if (!this.draining) {
      clearTimeout(lease.timer);
      lease.timer = setTimeout(() => {
        void this.end(owner, id);
      }, 5_000);
      lease.timer.unref();
    }
    // Unconfirmed remote IDs remain in memory for a subsequent drain/recovery
    // attempt. There is intentionally no claim of crash-durable recovery.
  }

  async listen(
    owner: string,
    id: string,
    signal: AbortSignal,
    emit: (event: AssistantVoiceEvent) => Promise<void>,
  ) {
    const lease = this.sessions.get(id);
    if (
      !lease ||
      lease.owner !== owner ||
      !lease.runtime ||
      lease.stopRequested ||
      lease.observing
    )
      throw new ForbiddenException();
    lease.observing = true;
    try {
      await this.assistant.requireConsent(owner);
      await lease.runtime.listen(signal, emit);
    } finally {
      await this.end(owner, id);
    }
  }

  private async hangup(id: string, lease: VoiceLease): Promise<boolean> {
    if (lease.termination) return lease.termination;
    const operation = (async () => {
      try {
        const response = await this.request(
          `https://api.openai.com/v1/realtime/calls/${lease.call}/hangup`,
          {
            method: "POST",
            redirect: "error",
            headers: {
              authorization: `Bearer ${this.environment.get("ASSISTANT_VOICE_API_KEY")}`,
            },
            signal: AbortSignal.timeout(5_000),
          },
        );
        if (!response.ok && response.status !== 404)
          throw new Error("Hangup failed");
        this.sessions.delete(id);
        return true;
      } catch {
        return false;
      }
    })();
    lease.termination = operation;
    try {
      return await operation;
    } finally {
      if (lease.termination === operation) lease.termination = undefined;
    }
  }

  async onModuleDestroy() {
    this.draining = true;
    this.drainEpoch++;
    for (const lease of this.sessions.values()) {
      lease.stopRequested = true;
      clearTimeout(lease.timer);
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        Promise.allSettled([
          ...this.initializing,
          ...[...this.sessions].map(([id, lease]) => this.end(lease.owner, id)),
        ]),
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, 20_000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
      if (this.sessions.size)
        this.logger.warn(
          `Voice shutdown unconfirmed for ${this.sessions.size} session(s); remote lifetime and project spend controls still apply`,
        );
    }
  }

  private async readSdp(response: Response) {
    if (!response.body) throw new Error("Missing SDP");
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let bytes = 0,
      text = "";
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > 64_000) throw new Error("SDP too large");
        text += decoder.decode(chunk.value, { stream: true });
      }
      return text + decoder.decode();
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }
}
