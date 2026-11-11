import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import type {
  AssistantConversation,
  AssistantTurn,
  AssistantVoiceEvent,
} from "@lazyfinance/contracts";
import { Test } from "@nestjs/testing";
import { describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import { z } from "zod";
import { testEnvironment } from "../../tests/fixtures/environment";
import type { AsyncStub, RpcStubs } from "../../tests/fixtures/rpc-stubs";
import { ActionsService } from "../actions/actions.service";
import { EnvironmentService } from "../environment/environment.service";
import { AssistantService } from "./assistant.service";
import { AssistantVoiceRuntime, VOICE_SOCKET } from "./assistant-voice-runtime";
import { FinancialReads } from "./financial-reads";

class Socket extends EventEmitter {
  readyState: number = WebSocket.OPEN;
  readonly sent: Record<string, unknown>[] = [];
  send(value: string) {
    const event = JSON.parse(value);
    this.sent.push(event);
    if (event.type === "session.update")
      queueMicrotask(() => this.event({ type: "session.updated" }));
  }
  close() {
    this.readyState = WebSocket.CLOSED;
    this.emit("close");
  }
  event(value: unknown) {
    this.emit("message", Buffer.from(JSON.stringify(value)));
  }
}

async function setup() {
  const socket = new Socket();
  const conversationId = randomUUID();
  const saved: AssistantTurn[] = [];
  const conversation = (): AssistantConversation => ({
    id: conversationId,
    title: "Conversación compartida",
    createdAt: "2026-11-11T00:00:00.000Z",
    updatedAt: "2026-11-11T00:00:00.000Z",
    expiresAt: "2026-12-11T00:00:00.000Z",
    turnCount: saved.length,
    turns: [...saved],
  });
  const store = {
    get: { query: vi.fn(async () => conversation()) },
    begin: {
      mutate: vi.fn(async (input) => {
        const turn: AssistantTurn = {
          id: input.requestId,
          question: input.text,
          text: "",
          status: "pending",
          createdAt: "2026-11-11T00:00:00.000Z",
          sources: [],
          actions: [],
        };
        const previous = conversation();
        saved.push(turn);
        return { acquired: true, conversation: previous, turn: { ...turn } };
      }),
    },
    finish: {
      mutate: vi.fn(async ({ turn }) => {
        const index = saved.findIndex((item) => item.id === turn.id);
        saved[index] = turn;
        return { saved: true };
      }),
    },
  } satisfies Pick<
    RpcStubs<ReturnType<AssistantService["conversations"]>>,
    "get" | "begin" | "finish"
  >;
  const execute = vi.fn(async (_owner: string, _input: unknown) => ({
    accounts: [],
  }));
  const tools = {
    consultar_saldos_cuentas: {
      title: "Cuentas y saldos",
      description: "Saldos propios",
      inputSchema: z.strictObject({}),
      path: "/cuentas",
      execute,
    },
  } satisfies Partial<FinancialReads["tools"]>;
  const prepare = vi.fn<AsyncStub<ActionsService["prepare"]>>(async () => {
    throw new Error("Unexpected proposal");
  });
  const get = vi.fn<AsyncStub<ActionsService["get"]>>(async () => {
    throw new Error("Unknown action");
  });
  const module = await Test.createTestingModule({
    providers: [
      AssistantVoiceRuntime,
      {
        provide: AssistantService,
        useValue: {
          conversations: () => store,
          requireConsent: async () => {},
        },
      },
      { provide: FinancialReads, useValue: { tools } },
      { provide: ActionsService, useValue: { prepare, get } },
      {
        provide: EnvironmentService,
        useValue: testEnvironment({ ASSISTANT_VOICE_API_KEY: "server-key" }),
      },
      // ws is the opaque transport seam; all domain test doubles above retain their signatures/results.
      { provide: VOICE_SOCKET, useValue: () => socket as unknown as WebSocket },
    ],
  }).compile();
  const connecting = module
    .get(AssistantVoiceRuntime)
    .connect("verified-owner", conversationId, "rtc_test");
  socket.emit("open");
  const run = await connecting;
  const controller = new AbortController();
  const events: AssistantVoiceEvent[] = [];
  const listening = run.listen(controller.signal, async (event) => {
    events.push(event);
  });
  const responses = () =>
    socket.sent.filter((event) => event.type === "response.create");
  const begin = async (item = "audio-1") => {
    const count = responses().length;
    socket.event({ type: "input_audio_buffer.speech_started", item_id: item });
    socket.event({ type: "input_audio_buffer.committed", item_id: item });
    await vi.waitFor(() => expect(responses().length).toBe(count + 1));
    socket.event({
      type: "response.created",
      response: { id: item, metadata: { voiceItem: item } },
    });
  };
  const finish = async (
    item = "audio-1",
    transcript = "Muéstrame mis cuentas",
  ) => {
    socket.event({
      type: "conversation.item.input_audio_transcription.completed",
      item_id: item,
      transcript,
    });
    socket.event({
      type: "response.output_audio_transcript.delta",
      response_id: item,
      delta: "Puedes revisar tus cuentas en pantalla.",
    });
    socket.event({
      type: "response.done",
      response: {
        id: item,
        status: "completed",
        output: [{ type: "message" }],
      },
    });
    await vi.waitFor(() => expect(store.finish.mutate).toHaveBeenCalled());
  };
  return {
    socket,
    run,
    saved,
    store,
    events,
    responses,
    execute,
    prepare,
    get,
    begin,
    finish,
    close: async () => {
      controller.abort();
      await run.close();
      await listening;
      await module.close();
    },
  };
}

describe("server-owned native audio conversation", () => {
  it("responds to committed AUDIO before transcription, runs owned tools and saves the shared readable turn", async () => {
    const f = await setup();
    try {
      await f.begin();
      expect(f.store.begin.mutate.mock.calls[0][0].text).toBe(
        "Consulta por voz",
      );
      expect(JSON.stringify(f.responses()[0])).not.toContain("Muéstrame");
      f.socket.event({
        type: "response.output_item.done",
        response_id: "audio-1",
        item: {
          type: "function_call",
          call_id: "read-1",
          name: "consultar_saldos_cuentas",
          arguments: "{}",
        },
      });
      await vi.waitFor(() =>
        expect(f.execute).toHaveBeenCalledExactlyOnceWith("verified-owner", {}),
      );
      await f.finish();
      expect(f.saved[0]).toMatchObject({
        status: "complete",
        voice: { question: "Muéstrame mis cuentas" },
        sources: [{ tool: "consultar_saldos_cuentas" }],
      });
      expect(f.events.some((event) => event.type === "source")).toBe(true);
      const config = JSON.stringify(
        f.socket.sent.find((event) => event.type === "session.update"),
      );
      expect(config).toContain("preparar_accion_financiera");
      expect(config).not.toContain("aprobar_accion");
      expect(config).not.toContain("server-key");
    } finally {
      await f.close();
    }
  });

  it("interrupts a slow tool without ending the session, discards late evidence and accepts a correction", async () => {
    const f = await setup();
    let resolve: (value: { accounts: never[] }) => void = () => {};
    f.execute.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    try {
      await f.begin();
      f.socket.event({
        type: "response.output_item.done",
        response_id: "audio-1",
        item: {
          type: "function_call",
          call_id: "slow",
          name: "consultar_saldos_cuentas",
          arguments: "{}",
        },
      });
      await vi.waitFor(() => expect(f.execute).toHaveBeenCalledOnce());
      f.socket.event({
        type: "input_audio_buffer.speech_started",
        item_id: "correction",
      });
      f.socket.event({
        type: "input_audio_buffer.committed",
        item_id: "correction",
      });
      resolve({ accounts: [] });
      await vi.waitFor(() => expect(f.responses()).toHaveLength(2));
      expect(f.saved[0].status).toBe("interrupted");
      expect(f.saved[0].sources).toEqual([]);
      expect(f.socket.readyState).toBe(WebSocket.OPEN);
      expect(f.events.filter((event) => event.type === "error")).toEqual([]);
    } finally {
      await f.close();
    }
  });

  it("does not save a completed spoken response as confirmed until its readable question arrives", async () => {
    const f = await setup();
    try {
      await f.begin();
      f.socket.event({
        type: "response.output_audio_transcript.delta",
        response_id: "audio-1",
        delta: "¿Qué período quieres revisar?",
      });
      f.socket.event({
        type: "response.done",
        response: {
          id: "audio-1",
          status: "completed",
          output: [{ type: "message" }],
        },
      });
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(f.store.finish.mutate).not.toHaveBeenCalled();
      f.socket.event({
        type: "conversation.item.input_audio_transcription.completed",
        item_id: "audio-1",
        transcript: "Mis gastos",
      });
      await vi.waitFor(() => expect(f.saved[0].status).toBe("complete"));
      expect(f.saved[0].voice?.question).toBe("Mis gastos");
    } finally {
      await f.close();
    }
  });

  it("deduplicates provider calls and refuses invented approval tools without any write execution", async () => {
    const f = await setup();
    try {
      await f.begin();
      const event = {
        type: "response.output_item.done",
        response_id: "audio-1",
        item: {
          type: "function_call",
          call_id: "injected",
          name: "aprobar_accion_financiera",
          arguments: JSON.stringify({ id: randomUUID() }),
        },
      };
      f.socket.event(event);
      f.socket.event(event);
      await vi.waitFor(() =>
        expect(
          f.socket.sent.filter((event) =>
            JSON.stringify(event).includes("function_call_output"),
          ),
        ).toHaveLength(1),
      );
      expect(f.execute).not.toHaveBeenCalled();
      expect(f.prepare).not.toHaveBeenCalled();
      expect(f.get).not.toHaveBeenCalled();
    } finally {
      await f.close();
    }
  });
});
