import { createHash, randomUUID } from "node:crypto";
import {
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  type OnModuleDestroy,
  ServiceUnavailableException,
} from "@nestjs/common";
import { EnvironmentService } from "../environment/environment.service";
import { AssistantService } from "./assistant.service";

export const VOICE_FETCH = Symbol("VOICE_FETCH");
const duration = 300_000;
interface VoiceLease {
  owner: string;
  call?: string;
  timer?: ReturnType<typeof setTimeout>;
}

/** Single-replica, bounded admission. Never exposes a provider credential. */
@Injectable()
export class AssistantVoiceService implements OnModuleDestroy {
  private readonly sessions = new Map<string, VoiceLease>();
  private readonly starts = new Map<string, number[]>();

  constructor(
    private readonly environment: EnvironmentService,
    private readonly assistant: AssistantService,
    @Inject(VOICE_FETCH) private readonly request: typeof fetch,
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
    if (!this.configuration().enabled)
      throw new ServiceUnavailableException("Voice unavailable");
    if (!origin || !this.environment.get("CORS_ORIGINS").includes(origin))
      throw new ForbiddenException();
    await this.assistant
      .conversations(owner)
      .get.query({ id: input.conversationId });
    signal.throwIfAborted();
    const now = Date.now();
    for (const [key, times] of this.starts) {
      const recent = times.filter((time) => time > now - 3_600_000);
      if (recent.length) this.starts.set(key, recent);
      else this.starts.delete(key);
    }
    const recent = this.starts.get(owner) ?? [];
    if (
      this.sessions.size >= 4 ||
      (this.starts.size >= 10_000 && !this.starts.has(owner)) ||
      [...this.sessions.values()].some((value) => value.owner === owner) ||
      recent.length >= 3
    )
      throw new HttpException("Voice capacity reached", 429);
    const id = randomUUID();
    const lease: VoiceLease = { owner };
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
          "Eres la voz de LazyFinance. Lee solamente el texto suministrado, sin añadir afirmaciones, nombres de proveedor ni acciones. Nunca ejecutes ni apruebes cambios.",
        tools: [],
        max_output_tokens: 1024,
        audio: {
          input: {
            transcription: { model: "gpt-4o-mini-transcribe", language: "es" },
            turn_detection: {
              type: "server_vad",
              create_response: false,
              interrupt_response: false,
            },
          },
          output: { voice: "marin" },
        },
      }),
    );
    try {
      // Complete an uncertain initialization even after browser disconnect so that
      // a returned call ID can be hung up, rather than orphaning paid processing.
      const response = await this.request(
        "https://api.openai.com/v1/realtime/calls",
        {
          method: "POST",
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
      lease.timer = setTimeout(
        () => {
          void this.end(owner, id);
        },
        Math.max(1, duration - (Date.now() - now)),
      );
      lease.timer.unref();
      const sdp = await response.text();
      if (sdp.length > 64_000 || !sdp.startsWith("v=0") || signal.aborted)
        throw new Error("Invalid or obsolete voice session");
      return { id, sdp, expiresAt: new Date(now + duration).toISOString() };
    } catch {
      await this.end(owner, id);
      throw new ServiceUnavailableException(
        "No pudimos iniciar la voz. Puedes continuar por texto.",
      );
    }
  }

  async end(owner: string, id: string) {
    const lease = this.sessions.get(id);
    // An opaque foreign ID neither reveals nor terminates another owner's call.
    if (!lease || lease.owner !== owner) return;
    clearTimeout(lease.timer);
    if (lease.call) {
      try {
        const response = await this.request(
          `https://api.openai.com/v1/realtime/calls/${lease.call}/hangup`,
          {
            method: "POST",
            headers: {
              authorization: `Bearer ${this.environment.get("ASSISTANT_VOICE_API_KEY")}`,
            },
            signal: AbortSignal.timeout(5_000),
          },
        );
        if (!response.ok && response.status !== 404)
          throw new Error("Hangup failed");
      } catch {
        // Keep admission occupied until bounded retry; never replay creation.
        lease.timer = setTimeout(() => {
          void this.end(owner, id);
        }, 5_000);
        lease.timer.unref();
        return;
      }
    }
    this.sessions.delete(id);
  }

  async onModuleDestroy() {
    await Promise.all(
      [...this.sessions].map(([id, lease]) => this.end(lease.owner, id)),
    );
    for (const lease of this.sessions.values()) clearTimeout(lease.timer);
  }
}
