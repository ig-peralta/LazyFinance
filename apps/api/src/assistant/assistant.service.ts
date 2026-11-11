import { randomUUID } from "node:crypto";
import {
  ASSISTANT_MAX_INPUT,
  ASSISTANT_MAX_OUTPUT,
  ASSISTANT_MAX_TURNS,
  AssistantConfigurationSchema,
  type AssistantEvent,
  type AssistantSend,
  type AssistantTurn,
} from "@lazyfinance/contracts";
import {
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ActionsService } from "../actions/actions.service";
import { EnvironmentService } from "../environment/environment.service";
import { PersistenceClient } from "../persistence/persistence.client";
import { AssistantConsentService } from "./assistant-consent.service";
import {
  assistantActionContext,
  assistantHistory,
  assistantInstructions,
} from "./assistant-policy";
import { ASSISTANT_RUNTIME, type AssistantRuntime } from "./assistant-runtime";
import { AssistantTurnTools } from "./assistant-turn-tools";
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

  async conversation(
    userId: string,
    id: string,
    mode: "text" | "voice" = "text",
  ) {
    const conversation = await this.conversations(userId).get.query({ id });
    if (conversation.mode !== mode)
      throw new NotFoundException("Conversation is unavailable");
    const turns =
      mode === "text"
        ? conversation.turns.filter(
            (turn) => !turn.voice && turn.question !== "Consulta por voz",
          )
        : conversation.turns;
    return { ...conversation, turns, turnCount: turns.length };
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
      const started = await store.begin.mutate({
        ...input,
        lease,
        mode: "text",
      });
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
      let text = "";
      let failed = false;
      const generation = new AbortController();
      const generationSignal = AbortSignal.any([signal, generation.signal]);
      const tools = new AssistantTurnTools(
        userId,
        input.conversationId,
        turn.id,
        this.reads,
        this.actions,
        generationSignal,
        emit,
      );
      const history = started.conversation.turns.filter(
        (turn) => !turn.voice && turn.question !== "Consulta por voz",
      );
      tools.observeHistory(history);
      try {
        await emit({ type: "turn", turn });
        const outcome = await this.runtime.run({
          instructions:
            assistantInstructions() + assistantActionContext(history),
          messages: [
            ...assistantHistory(history),
            { role: "user", content: input.text },
          ],
          signal: generationSignal,
          read: (name, raw) => tools.read(name, raw),
          propose: (value) => tools.propose(value),
          revise: (value) => tools.revise(value),
          actionStatus: (id) => tools.actionStatus(id),
          delta: async (delta) => {
            generationSignal.throwIfAborted();
            if (text.length + delta.length > ASSISTANT_MAX_OUTPUT)
              throw new Error("Answer budget exhausted");
            text += delta;
            await emit({ type: "delta", text: delta });
          },
        });
        signal.throwIfAborted();
        if (!outcome.complete || !tools.grounded(text))
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
        sources: tools.sources,
        actions: tools.actions,
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
