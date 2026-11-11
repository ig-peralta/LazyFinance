import { Injectable, inject } from "@angular/core";
import {
  ASSISTANT_MAX_OUTPUT,
  type AssistantEvent,
  AssistantEventSchema,
  type AssistantSend,
  AssistantSendSchema,
} from "@lazyfinance/contracts";
import {
  AuthCredentials,
  type VerifiedCredentials,
} from "../../core/auth/auth-credentials";
import { RPC_FETCH } from "../../core/rpc/rpc-client";
import { API_URL } from "../../tokens/api-url";

/** First-party authenticated stream; neither cookies nor browser-supplied history are sent. */
@Injectable({ providedIn: "root" })
export class AssistantStreamClient {
  private readonly api = inject(API_URL).replace(/\/$/, "");
  private readonly fetch = inject(RPC_FETCH);
  private readonly credentials = inject(AuthCredentials);

  async send(
    owner: VerifiedCredentials,
    input: AssistantSend,
    signal: AbortSignal,
    receive: (event: AssistantEvent) => void,
  ) {
    const message = AssistantSendSchema.parse(input);
    const response = await this.fetch(`${this.api}/assistant/turns`, {
      method: "POST",
      credentials: "omit",
      cache: "no-store",
      signal: AbortSignal.any([owner.signal, signal]),
      headers: {
        authorization: `Bearer ${owner.token}`,
        "content-type": "application/json",
        accept: "application/x-ndjson",
      },
      body: JSON.stringify(message),
    });
    if (response.status === 401) this.credentials.expire(owner);
    if (
      !response.ok ||
      !response.body ||
      !response.headers.get("content-type")?.startsWith("application/x-ndjson")
    )
      throw new Error(
        "No se confirmó la respuesta. Consulta el historial antes de volver a enviar el mensaje.",
      );
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let opened = false;
    let characters = 0;
    const actionIds = new Set<string>();
    let buffer = "",
      bytes = 0,
      confirmed = false;
    const accept = (line: string) => {
      if (!line.trim()) return;
      owner.signal.throwIfAborted();
      signal.throwIfAborted();
      const event = AssistantEventSchema.parse(JSON.parse(line));
      if (
        (confirmed && event.type !== "error") ||
        (!opened && event.type !== "turn") ||
        (opened && event.type === "turn")
      )
        throw new Error("Secuencia de respuesta inválida.");
      if (
        (event.type === "turn" || event.type === "done") &&
        (event.turn.id !== message.requestId ||
          event.turn.question !== message.text)
      )
        throw new Error("La respuesta no corresponde a este mensaje.");
      if (event.type === "turn") {
        opened = true;
        characters = event.turn.text.length;
      }
      if (event.type === "delta") characters += event.text.length;
      if (
        event.type === "action" &&
        (event.action.conversationId !== message.conversationId ||
          event.action.turnId !== message.requestId ||
          event.action.origin !== "assistant" ||
          event.action.status !== "proposed")
      )
        throw new Error("La propuesta no corresponde a este mensaje.");
      if (event.type === "action") {
        actionIds.add(event.action.id);
        if (actionIds.size > 4)
          throw new Error("La respuesta excede el límite de propuestas.");
      }
      if (
        event.type === "action_updated" &&
        (event.action.conversationId !== message.conversationId ||
          !event.action.turnId ||
          event.action.origin !== "assistant")
      )
        throw new Error("La corrección no corresponde a esta conversación.");
      if (event.type === "turn" || event.type === "done") {
        const actions = event.turn.actions;
        if (
          actions.some(
            (action) =>
              action.conversationId !== message.conversationId ||
              action.turnId !== message.requestId ||
              action.origin !== "assistant",
          ) ||
          new Set(actions.map((action) => action.id)).size !== actions.length
        )
          throw new Error("La propuesta no corresponde a este mensaje.");
      }
      if (characters > ASSISTANT_MAX_OUTPUT)
        throw new Error("La respuesta excede el límite permitido.");
      if (event.type === "done") {
        if (event.turn.status === "pending")
          throw new Error("La respuesta no está confirmada.");
        confirmed = true;
      }
      receive(event);
    };
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > 2_000_000)
          throw new Error("La respuesta excede el límite permitido.");
        buffer += decoder.decode(chunk.value, { stream: true });
        let end = buffer.indexOf("\n");
        while (end >= 0) {
          accept(buffer.slice(0, end));
          buffer = buffer.slice(end + 1);
          end = buffer.indexOf("\n");
        }
        if (buffer.length > 500_000)
          throw new Error("Evento de respuesta demasiado grande.");
      }
      buffer += decoder.decode();
      if (buffer.trim()) accept(buffer);
      if (!confirmed)
        throw new Error(
          "La conexión terminó sin confirmar la respuesta. Revisa su estado en el historial.",
        );
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }
}
