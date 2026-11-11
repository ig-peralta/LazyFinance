import { randomUUID } from "node:crypto";
import {
  ASSISTANT_MAX_INPUT,
  ASSISTANT_MAX_OUTPUT,
  ASSISTANT_MAX_TURNS,
  AssistantConfigurationSchema,
  type AssistantEvent,
  AssistantReadNameSchema,
  type AssistantSend,
  type AssistantSource,
  AssistantSourceSchema,
  type AssistantTurn,
  type FinancialAction,
} from "@lazyfinance/contracts";
import {
  HttpException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ActionsService } from "../actions/actions.service";
import { EnvironmentService } from "../environment/environment.service";
import { PersistenceClient } from "../persistence/persistence.client";
import { AssistantConsentService } from "./assistant-consent.service";
import { assistantHistory, assistantInstructions } from "./assistant-policy";
import { ASSISTANT_RUNTIME, type AssistantRuntime } from "./assistant-runtime";
import { FinancialReads } from "./financial-reads";

@Injectable()
export class AssistantService {
  private running = 0;

  constructor(
    private readonly persistence: PersistenceClient,
    private readonly environment: EnvironmentService,
    private readonly reads: FinancialReads,
    private readonly actions: ActionsService,
    @Inject(ASSISTANT_RUNTIME) private readonly runtime: AssistantRuntime,
    private readonly consent: AssistantConsentService,
  ) {}

  configuration() {
    const provider = this.environment.get("ASSISTANT_PROVIDER");
    return AssistantConfigurationSchema.parse({
      enabled: provider !== "disabled",
      provider,
      model: this.environment.get("ASSISTANT_MODEL") ?? "",
      demonstration: provider === "demo",
      maxTurns: ASSISTANT_MAX_TURNS,
      maxInput: ASSISTANT_MAX_INPUT,
    });
  }

  conversations(userId: string) {
    return this.persistence.user(userId).assistantConversations;
  }

  requireConsent(owner: string) {
    return this.consent.requireAccepted(owner);
  }

  async stream(
    userId: string,
    input: AssistantSend,
    signal: AbortSignal,
    emit: (event: AssistantEvent) => Promise<void>,
  ) {
    if (!this.configuration().enabled)
      throw new ServiceUnavailableException("Assistant is not configured");
    signal.throwIfAborted();
    await this.requireConsent(userId);
    signal.throwIfAborted();
    if (this.running >= 8)
      throw new HttpException("Assistant capacity reached", 429);
    this.running++;
    try {
      const lease = randomUUID();
      signal.throwIfAborted();
      const store = this.conversations(userId);
      const started = await store.begin.mutate({ ...input, lease });
      let turn: AssistantTurn = started.turn;
      if (!started.acquired) {
        await emit({ type: "turn", turn });
        if (turn.status === "pending")
          await emit({
            type: "error",
            message:
              "La respuesta sigue en curso. Consulta el historial; no volveremos a ejecutar el mensaje.",
          });
        else await emit({ type: "done", turn });
        return;
      }
      const sources: AssistantSource[] = [];
      const actions: FinancialAction[] = [];
      let observedReceipt = false;
      let proposals = 0;
      let sourceBytes = 0;
      let calls = 0;
      let text = "";
      let failed = false;
      const generation = new AbortController();
      const generationSignal = AbortSignal.any([signal, generation.signal]);
      try {
        await emit({ type: "turn", turn });
        const outcome = await this.runtime.run({
          instructions: assistantInstructions(),
          messages: [
            ...assistantHistory(started.conversation.turns),
            { role: "user", content: input.text },
          ],
          signal: generationSignal,
          read: async (name, raw) => {
            generationSignal.throwIfAborted();
            const ordinal = ++calls;
            if (ordinal > 8) throw new Error("Tool budget exhausted");
            const validName = AssistantReadNameSchema.parse(name);
            const definition = this.reads.tools[validName];
            await emit({
              type: "status",
              text: `Consultando ${definition.title.toLowerCase()}…`,
            });
            let data: AssistantSource["data"] = null;
            let status: AssistantSource["status"] = "available";
            let note =
              "Datos guardados de LazyFinance. La hora de consulta no equivale a la última actualización bancaria. Revisa los períodos, cortes, estimaciones y cobertura del resultado.";
            let period: string | null = null;
            let recordId: string | null = null;
            try {
              // Validation happens before execution; userId is closed over, never accepted from the model.
              const args = definition.inputSchema.parse(raw);
              if (
                typeof args === "object" &&
                args &&
                "month" in args &&
                typeof args.month === "string"
              )
                period = args.month;
              data = await definition.execute(userId, args);
              generationSignal.throwIfAborted();
              if (
                args &&
                typeof args === "object" &&
                "id" in args &&
                typeof args.id === "string"
              )
                recordId = args.id;
              const bytes = Buffer.byteLength(JSON.stringify(data));
              if (bytes > 24_000 || sourceBytes + bytes > 64_000) {
                status = "limited";
                data = null;
                note =
                  "El resultado supera el límite del asistente. Acota la consulta o abre la sección original; no es un resultado completo ni equivale a cero.";
              } else sourceBytes += bytes;
            } catch {
              generationSignal.throwIfAborted();
              status = "unavailable";
              data = null;
              note =
                "No se pudo consultar esta fuente con esos parámetros. Puede faltar información o acceso al registro. No asumas importes cero ni inventes datos.";
            }
            const source = AssistantSourceSchema.parse({
              id: `F${ordinal}`,
              tool: validName,
              title: definition.title,
              status,
              queriedAt: new Date().toISOString(),
              month: period,
              path: definition.path,
              recordId,
              note,
              data,
            });
            sources.push(source);
            await emit({ type: "source", source });
            return source;
          },
          propose: async (value) => {
            generationSignal.throwIfAborted();
            if (++proposals > 4) throw new Error("Proposal budget exhausted");
            const action = await this.actions.prepare(
              userId,
              input.conversationId,
              turn.id,
              value,
            );
            generationSignal.throwIfAborted();
            if (!actions.some((existing) => existing.id === action.id))
              actions.push(action);
            await emit({ type: "action", action });
            return action;
          },
          actionStatus: async (id) => {
            generationSignal.throwIfAborted();
            if (++calls > 8) throw new Error("Tool budget exhausted");
            const action = await this.actions.get(userId, id);
            if (action.conversationId !== input.conversationId)
              throw new Error("Action is not part of this conversation");
            generationSignal.throwIfAborted();
            observedReceipt ||= action.status === "applied";
            return action;
          },
          delta: async (delta) => {
            generationSignal.throwIfAborted();
            if (text.length + delta.length > ASSISTANT_MAX_OUTPUT)
              throw new Error("Answer budget exhausted");
            text += delta;
            await emit({ type: "delta", text: delta });
          },
        });
        signal.throwIfAborted();
        const citations = [...text.matchAll(/\[F(\d+)\]/g)].map(
          (match) => `F${match[1]}`,
        );
        const available = sources.filter(
          (source) => source.status === "available",
        );
        if (
          !outcome.complete ||
          !text.trim() ||
          citations.some(
            (id) => !available.some((source) => source.id === id),
          ) ||
          (!available.length &&
            !actions.length &&
            !observedReceipt &&
            /\d/.test(text.replace(/\[F\d+\]/g, "")))
        )
          throw new Error("Answer is incomplete or lacks consulted evidence");
      } catch {
        failed = !signal.aborted;
      } finally {
        // Stop the SDK/provider and reject delayed callbacks even when validation
        // or a consumer failure, rather than the browser, ends this generation.
        generation.abort();
      }
      turn = {
        ...turn,
        text,
        sources,
        actions,
        status: signal.aborted ? "interrupted" : failed ? "failed" : "complete",
      };
      // Completion is a separate, lease-checked transaction. It contains no provider call.
      const saved = await store.finish.mutate({
        conversationId: input.conversationId,
        lease,
        turn,
      });
      if (!saved.saved)
        throw new Error("Conversation changed before completion");
      if (!signal.aborted) {
        await emit({ type: "done", turn });
        if (failed)
          await emit({
            type: "error",
            message:
              "No pude completar una respuesta verificable. El mensaje quedó marcado como incompleto; puedes volver a preguntar sin asumir que esa respuesta es correcta.",
          });
      }
    } finally {
      this.running--;
    }
  }
}
