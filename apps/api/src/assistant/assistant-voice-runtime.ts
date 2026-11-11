import { randomUUID } from "node:crypto";
import {
  ASSISTANT_MAX_OUTPUT,
  AssistantReadNameSchema,
  type AssistantTurn,
  type AssistantVoiceEvent,
  type FinancialAction,
  FinancialActionIdSchema,
  FinancialActionInputSchema,
  ReviseFinancialActionSchema,
} from "@lazyfinance/contracts";
import { Inject, Injectable } from "@nestjs/common";
import WebSocket from "ws";
import { z } from "zod";
import { ActionsService } from "../actions/actions.service";
import { EnvironmentService } from "../environment/environment.service";
import { AssistantService } from "./assistant.service";
import {
  assistantActionContext,
  assistantHistory,
  assistantInstructions,
  assistantProposalDescription,
  assistantRevisionDescription,
} from "./assistant-policy";
import {
  AssistantProposalConflict,
  AssistantTurnTools,
} from "./assistant-turn-tools";
import { FinancialReads } from "./financial-reads";

export const VOICE_SOCKET = Symbol("VOICE_SOCKET");
export type VoiceSocketFactory = (call: string, key: string) => WebSocket;
export const voiceSocket: VoiceSocketFactory = (call, key) =>
  new WebSocket(
    `wss://api.openai.com/v1/realtime?call_id=${encodeURIComponent(call)}`,
    {
      headers: { authorization: `Bearer ${key}` },
      maxPayload: 128_000,
      handshakeTimeout: 10_000,
    },
  );

const voiceInstructions = `\nModo voz: escuchas audio nativo. Habla en español de Chile, con acento chileno natural y suave, tuteo y ritmo tranquilo; sin exagerar modismos ni imitar una caricatura. Responde en una o dos frases cortas, sin listas, Markdown, informes ni despedidas repetidas. No narres que vas a consultar: usa las herramientas en silencio y habla después del resultado. Si falta un dato, pregunta solo por ese dato y conserva lo que el usuario ya indicó. Las consultas actualizan el espacio en pantalla: para mostrar gráficos usa el resumen o comparación, para acotar por etiqueta usa compras del gasto, y para mostrar compras usa evidencia o buscar_movimientos. No navegues fuera del espacio. Si te interrumpen, acepta la corrección sin reiniciar la tarea. Decir sí NUNCA aprueba: deben revisar y pulsar el botón en pantalla. Conserva fechas, limitaciones y cifras exactas en las fuentes visibles. No afirmes cantidades personales antes de recibir herramientas de este turno. Nunca inventes un resultado visual ni un cambio aplicado.`;
const actionStates = {
  proposed: 0,
  stale: 1,
  expired: 1,
  cancelled: 2,
  applied: 3,
};
const eventSchema = z.object({
  type: z.string(),
  item_id: z.string().optional(),
  transcript: z.string().max(16_000).optional(),
  delta: z.string().max(16_000).optional(),
  response_id: z.string().optional(),
  response: z
    .object({
      id: z.string(),
      status: z.string().optional(),
      metadata: z.object({ voiceItem: z.string().optional() }).nullish(),
      output: z.array(z.object({ type: z.string() })).optional(),
    })
    .optional(),
  item: z
    .object({
      type: z.string(),
      call_id: z.string().optional(),
      name: z.string().optional(),
      arguments: z.string().max(24_000).optional(),
    })
    .optional(),
  error: z.object({ code: z.string().optional() }).optional(),
});
type ProviderEvent = z.infer<typeof eventSchema>;
const handledEvents = new Set([
  "error",
  "session.updated",
  "input_audio_buffer.speech_started",
  "input_audio_buffer.committed",
  "conversation.item.input_audio_transcription.completed",
  "conversation.item.input_audio_transcription.failed",
  "response.created",
  "response.output_audio_transcript.delta",
  "response.output_item.done",
  "response.done",
]);
interface VoiceTurn {
  item: string;
  lease: string;
  turn: AssistantTurn;
  tools: AssistantTurnTools;
  controller: AbortController;
  response?: string;
  done?: boolean;
  timeout: ReturnType<typeof setTimeout>;
}

@Injectable()
export class AssistantVoiceRuntime {
  constructor(
    private readonly assistant: AssistantService,
    private readonly reads: FinancialReads,
    private readonly actions: ActionsService,
    private readonly environment: EnvironmentService,
    @Inject(VOICE_SOCKET) private readonly socket: VoiceSocketFactory,
  ) {}

  async connect(owner: string, conversationId: string, call: string) {
    const socket = this.socket(
      call,
      this.environment.get("ASSISTANT_VOICE_API_KEY") ?? "",
    );
    const run = new RealtimeConversation(
      owner,
      conversationId,
      socket,
      this.assistant,
      this.reads,
      this.actions,
    );
    await run.open();
    return run;
  }
}

/** One native-audio session. Only provider events reach tool execution; the browser has no tool endpoint. */
export class RealtimeConversation {
  private queue: Promise<void> = Promise.resolve();
  private active?: VoiceTurn;
  private speech?: string;
  private readonly seen = new Set<string>();
  private readonly calls = new Set<string>();
  private readonly transcripts = new Map<string, string>();
  private readonly awaitingTranscripts = new Map<string, string>();
  private readonly events: AssistantVoiceEvent[] = [];
  private wake?: () => void;
  private closed = false;
  private listening = false;
  private idle?: ReturnType<typeof setTimeout>;
  private instructions = "";
  private contextTurns: AssistantTurn[] = [];
  private readonly actionUpdates = new Map<string, FinancialAction>();
  private unobserve?: () => void;
  private ready?: { resolve: () => void; reject: (error: Error) => void };
  private queued = 0;

  constructor(
    private readonly owner: string,
    private readonly conversationId: string,
    private readonly socket: WebSocket,
    private readonly assistant: AssistantService,
    private readonly reads: FinancialReads,
    private readonly actions: ActionsService,
  ) {}

  async open() {
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("Sideband timeout")),
          10_000,
        );
        const fail = () => {
          clearTimeout(timer);
          reject(new Error("Sideband unavailable"));
        };
        this.socket.once("error", fail);
        this.socket.once("close", fail);
        this.socket.once("open", () => {
          clearTimeout(timer);
          this.socket.off("error", fail);
          this.socket.off("close", fail);
          resolve();
        });
      });
      this.socket.on("error", () => this.fail());
      this.socket.on("close", () => this.fail());
      this.socket.on("message", (raw) => {
        if (this.closed) return;
        try {
          const value: unknown = JSON.parse(raw.toString());
          if (
            !handledEvents.has(z.object({ type: z.string() }).parse(value).type)
          )
            return;
          const event = eventSchema.parse(value);
          if (event.type === "session.updated") this.ready?.resolve();
          if (++this.queued > 128) throw new Error("Voice event backlog");
          // Barge-in invalidates in-flight tools synchronously, not behind their promises.
          if (
            event.type === "input_audio_buffer.speech_started" &&
            event.item_id
          ) {
            this.speech = event.item_id;
            this.active?.controller.abort();
            this.send({ type: "response.cancel" });
            this.send({ type: "output_audio_buffer.clear" });
          }
          this.queue = this.queue
            .then(() => this.handle(event))
            .catch(() => this.fail())
            .finally(() => {
              this.queued--;
            });
        } catch {
          this.fail();
        }
      });
      const conversation = await this.assistant
        .conversations(this.owner)
        .get.query({ id: this.conversationId });
      this.contextTurns = conversation.turns;
      this.refreshInstructions();
      this.unobserve = this.actions.observe(
        this.owner,
        this.conversationId,
        (action) => {
          this.queue = this.queue
            .then(async () => {
              if (this.closed) return;
              await this.assistant.requireConsent(this.owner);
              if (this.closed) return;
              const previous = this.actionUpdates.get(action.id);
              if (
                previous &&
                (previous.version > action.version ||
                  (previous.version === action.version &&
                    actionStates[previous.status] >=
                      actionStates[action.status]))
              )
                return;
              this.actionUpdates.set(action.id, action);
              this.refreshInstructions();
              this.send({
                type: "session.update",
                session: { type: "realtime", instructions: this.instructions },
              });
            })
            .catch(() => this.fail());
        },
      );
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const configured = new Promise<void>((resolve, reject) => {
          this.ready = { resolve, reject };
          timer = setTimeout(
            () => reject(new Error("Voice configuration unconfirmed")),
            5_000,
          );
        });
        this.send({
          type: "session.update",
          session: {
            type: "realtime",
            instructions: this.instructions,
            tools: this.definitions(),
            tool_choice: "auto",
          },
        });
        await configured;
      } finally {
        clearTimeout(timer);
        this.ready = undefined;
      }
      for (const message of assistantHistory(conversation.turns))
        this.send({
          type: "conversation.item.create",
          item: {
            type: "message",
            role: message.role,
            content: [
              {
                type: message.role === "user" ? "input_text" : "output_text",
                text: message.content,
              },
            ],
          },
        });
      this.touch();
      this.publish({ type: "phase", state: "listening" });
    } catch (error) {
      await this.close();
      throw error;
    }
  }

  private definitions() {
    return [
      ...Object.entries(this.reads.tools).map(([name, definition]) => ({
        type: "function",
        name,
        description: definition.description,
        parameters: z.toJSONSchema(definition.inputSchema, {
          unrepresentable: "any",
        }),
      })),
      {
        type: "function",
        name: "preparar_accion_financiera",
        description: assistantProposalDescription,
        parameters: z.toJSONSchema(FinancialActionInputSchema, {
          unrepresentable: "any",
        }),
      },
      {
        type: "function",
        name: "corregir_propuesta_financiera",
        description: assistantRevisionDescription,
        parameters: z.toJSONSchema(ReviseFinancialActionSchema, {
          unrepresentable: "any",
        }),
      },
      {
        type: "function",
        name: "consultar_estado_accion",
        description:
          "Estado real de una propuesta de esta conversación. applied y results confirman ejecución.",
        parameters: z.toJSONSchema(FinancialActionIdSchema),
      },
    ];
  }

  private refreshInstructions() {
    this.instructions =
      assistantInstructions() +
      voiceInstructions +
      assistantActionContext(this.contextTurns, [
        ...this.actionUpdates.values(),
      ]);
  }

  private send(value: unknown) {
    if (!this.closed && this.socket.readyState === WebSocket.OPEN)
      this.socket.send(JSON.stringify(value));
  }

  private touch() {
    clearTimeout(this.idle);
    this.idle = setTimeout(() => this.fail(), 60_000);
    this.idle.unref();
  }

  private publish(event: AssistantVoiceEvent) {
    if (this.closed) return;
    if (this.events.length >= 256) {
      void this.close();
      return;
    }
    this.events.push(event);
    this.wake?.();
  }

  async listen(
    signal: AbortSignal,
    emit: (event: AssistantVoiceEvent) => Promise<void>,
  ) {
    if (this.listening || this.closed)
      throw new Error("Voice stream unavailable");
    this.listening = true;
    signal.addEventListener("abort", () => this.wake?.(), { once: true });
    while (!signal.aborted && !this.closed) {
      const event = this.events.shift();
      if (event) await emit(event);
      else
        await new Promise<void>((resolve) => {
          this.wake = resolve;
          if (signal.aborted || this.closed || this.events.length) resolve();
        });
    }
    this.wake = undefined;
  }

  private async handle(event: ProviderEvent) {
    if (this.closed) return;
    if (
      event.type === "error" &&
      event.error?.code !== "response_cancel_not_active"
    )
      throw new Error("Provider error");
    if (event.type === "conversation.item.input_audio_transcription.failed")
      throw new Error("Missing readable record");
    if (event.type === "input_audio_buffer.speech_started") {
      this.touch();
      await this.finish("interrupted");
      this.publish({ type: "phase", state: "listening" });
    }
    if (
      event.type === "input_audio_buffer.committed" &&
      event.item_id &&
      event.item_id === this.speech &&
      !this.seen.has(event.item_id)
    ) {
      if (this.seen.size >= 24) throw new Error("Voice turn limit");
      this.seen.add(event.item_id);
      await this.assistant.requireConsent(this.owner);
      const item = event.item_id;
      const lease = randomUUID();
      const started = await this.assistant
        .conversations(this.owner)
        .begin.mutate({
          conversationId: this.conversationId,
          requestId: randomUUID(),
          lease,
          text: "Consulta por voz",
        });
      if (!started.acquired) throw new Error("Voice lease unavailable");
      const controller = new AbortController();
      const tools = new AssistantTurnTools(
        this.owner,
        this.conversationId,
        started.turn.id,
        this.reads,
        this.actions,
        controller.signal,
        async (event) => {
          this.publish(event);
        },
      );
      const timeout = setTimeout(() => this.fail(), 65_000);
      timeout.unref();
      this.active = {
        item,
        lease,
        turn: started.turn,
        tools,
        controller,
        timeout,
      };
      this.publish({ type: "turn", turn: started.turn });
      // The response consumes the committed AUDIO item; transcription is not an input to generation.
      if (this.closed || this.speech !== item) {
        controller.abort();
        await this.finish("interrupted");
        return;
      }
      this.contextTurns = started.conversation.turns;
      for (const action of this.contextTurns.flatMap((turn) => turn.actions)) {
        const update = this.actionUpdates.get(action.id);
        if (
          update &&
          (action.version > update.version ||
            (action.version === update.version &&
              actionStates[action.status] >= actionStates[update.status]))
        )
          this.actionUpdates.delete(action.id);
      }
      tools.observeHistory(this.contextTurns, [...this.actionUpdates.values()]);
      this.refreshInstructions();
      this.publish({ type: "phase", state: "querying" });
      this.respond();
    }
    if (
      event.type === "conversation.item.input_audio_transcription.completed" &&
      event.item_id &&
      event.transcript
    ) {
      if (this.transcripts.has(event.item_id)) return;
      if (event.transcript.length > 2000 || this.transcripts.size >= 24)
        throw new Error("Transcription limit");
      this.transcripts.set(event.item_id, event.transcript);
      const turnId = this.awaitingTranscripts.get(event.item_id);
      if (turnId) {
        const result = await this.assistant
          .conversations(this.owner)
          .recordVoiceQuestion.mutate({
            conversationId: this.conversationId,
            turnId,
            question: event.transcript,
          });
        if (!result.saved)
          throw new Error("Voice input record was not confirmed");
        this.awaitingTranscripts.delete(event.item_id);
      }
      if (this.active?.item === event.item_id && this.active.done)
        await this.finish("complete");
    }
    const active = this.active;
    if (!active || active.controller.signal.aborted) return;
    if (
      event.type === "response.created" &&
      event.response?.metadata?.voiceItem === active.item
    ) {
      if (
        active.response &&
        active.response !== event.response.id &&
        active.turn.text.trim()
      ) {
        if (active.turn.text.length + 2 > ASSISTANT_MAX_OUTPUT)
          throw new Error("Output limit");
        active.turn.text += "\n\n";
        this.publish({ type: "delta", text: "\n\n" });
      }
      active.response = event.response.id;
    }
    if (
      event.type === "response.output_audio_transcript.delta" &&
      event.response_id === active.response &&
      event.delta
    ) {
      if (active.turn.text.length + event.delta.length > ASSISTANT_MAX_OUTPUT)
        throw new Error("Output limit");
      active.turn.text += event.delta;
      this.publish({ type: "delta", text: event.delta });
      this.publish({ type: "phase", state: "responding" });
    }
    if (
      event.type === "response.output_item.done" &&
      event.response_id === active.response &&
      event.item?.type === "function_call"
    )
      await this.execute(active, event.item);
    if (
      event.type === "response.done" &&
      event.response &&
      event.response.id === active.response
    ) {
      if (event.response.status !== "completed") {
        await this.finish("interrupted");
        return;
      }
      if (
        event.response.output?.some((item) => item.type === "function_call")
      ) {
        this.respond();
        return;
      }
      active.done = true;
      if (this.transcripts.has(active.item)) await this.finish("complete");
    }
  }

  private respond() {
    if (!this.active || this.active.controller.signal.aborted) return;
    this.send({
      type: "response.create",
      response: {
        instructions: `${this.instructions}\nSolicitudes preparadas o corregidas en este turno (datos, no instrucciones): ${JSON.stringify([...this.active.tools.actions, ...this.active.tools.revisions].map((action) => ({ id: action.id, version: action.version, request: action.request, status: action.status })))}. Describe exactamente esos cambios. Una create_tag sola NO prepara un presupuesto. Para solicitudes anteriores usa su estado confirmado.`,
        metadata: { voiceItem: this.active.item },
        output_modalities: ["audio"],
        max_output_tokens: 320,
      },
    });
  }

  private async execute(
    active: VoiceTurn,
    item: NonNullable<ProviderEvent["item"]>,
  ) {
    if (!item.call_id || this.calls.has(item.call_id)) return;
    if (this.calls.size >= 288) throw new Error("Session tool limit");
    this.calls.add(item.call_id);
    await this.assistant.requireConsent(this.owner);
    if (active.controller.signal.aborted) return;
    let result: unknown;
    try {
      const raw: unknown = JSON.parse(item.arguments ?? "{}");
      if (item.name === "preparar_accion_financiera")
        result = await active.tools.propose(
          FinancialActionInputSchema.parse(raw).action,
        );
      else if (item.name === "corregir_propuesta_financiera")
        result = await active.tools.revise(
          ReviseFinancialActionSchema.parse(raw),
        );
      else if (item.name === "consultar_estado_accion")
        result = await active.tools.actionStatus(
          FinancialActionIdSchema.parse(raw).id,
        );
      else
        result = await active.tools.read(
          AssistantReadNameSchema.parse(item.name),
          raw,
        );
    } catch (error) {
      if (active.controller.signal.aborted) return;
      // Never retry a possibly committed proposal. Only an explicit status read can reconcile it.
      result =
        error instanceof AssistantProposalConflict
          ? { status: "needs_review", note: error.message }
          : {
              status: "unavailable",
              note: "No se confirmó esta consulta o propuesta. No afirmes éxito ni repitas una escritura. Pide revisar su estado en pantalla.",
            };
    }
    if (active.controller.signal.aborted) return;
    this.send({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: item.call_id,
        output: JSON.stringify(result),
      },
    });
  }

  private async finish(status: AssistantTurn["status"]) {
    const active = this.active;
    if (!active) return;
    this.active = undefined;
    clearTimeout(active.timeout);
    active.controller.abort();
    const question = this.transcripts.get(active.item);
    const confirmed =
      status === "complete" &&
      !!question &&
      active.tools.grounded(active.turn.text);
    const turn: AssistantTurn = {
      ...active.turn,
      sources: active.tools.sources,
      actions: active.tools.actions,
      status:
        status === "complete" ? (confirmed ? "complete" : "failed") : status,
      voice: {
        question:
          question ?? "Audio interrumpido · transcripción no disponible",
        ...(!question ? { transcriptionPending: true as const } : {}),
      },
    };
    const saved = await this.assistant.conversations(this.owner).finish.mutate({
      conversationId: this.conversationId,
      lease: active.lease,
      turn,
    });
    if (!saved.saved) throw new Error("Voice history was not confirmed");
    this.contextTurns = [
      ...this.contextTurns.filter((value) => value.id !== turn.id),
      turn,
    ];
    if (!question) this.awaitingTranscripts.set(active.item, turn.id);
    this.publish({ type: "done", turn });
    this.publish({ type: "phase", state: "listening" });
    if (status === "complete" && !confirmed)
      throw new Error("Unconfirmed voice answer");
  }

  private fail() {
    if (this.closed) return;
    this.ready?.reject(new Error("Voice configuration failed"));
    this.publish({
      type: "error",
      message:
        "La voz terminó sin confirmar una respuesta. Revisa el historial antes de volver a preguntar.",
    });
    void this.close();
  }

  async close() {
    if (this.closed) return this.queue;
    this.closed = true;
    this.unobserve?.();
    clearTimeout(this.idle);
    this.active?.controller.abort();
    this.socket.close();
    this.wake?.();
    // Drain already-started tools before finishing the lease. Never replay a proposal.
    this.queue = this.queue
      .catch(() => {})
      .then(() => this.finish("interrupted"))
      .catch(() => {});
    return this.queue;
  }
}
