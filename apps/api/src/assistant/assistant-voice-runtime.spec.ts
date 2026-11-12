import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import type {
  AssistantTurn,
  AssistantVoiceEvent,
  FinancialAction,
} from "@lazyfinance/contracts";
import { FinancialActionRequestSchema } from "@lazyfinance/contracts";
import { type StoredAssistantConversationSchema } from "@lazyfinance/contracts/internal";
import { Logger } from "@nestjs/common";
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

async function setup(history: AssistantTurn[] = [], attachObserver = true) {
  const socket = new Socket();
  const conversationId = randomUUID();
  const saved: AssistantTurn[] = [...history];
  const conversation = (): z.infer<
    typeof StoredAssistantConversationSchema
  > => ({
    id: conversationId,
    mode: "voice",
    title: "Sesión de voz",
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
    recordVoiceQuestion: {
      mutate: vi.fn(async ({ turnId, question }) => {
        const index = saved.findIndex((turn) => turn.id === turnId);
        if (index < 0) return { saved: false };
        saved[index] = { ...saved[index], voice: { question } };
        return { saved: true };
      }),
    },
  } satisfies Pick<
    RpcStubs<ReturnType<AssistantService["conversations"]>>,
    "get" | "begin" | "finish" | "recordVoiceQuestion"
  >;
  const execute = vi.fn(async (_owner: string, _input: unknown) => ({
    accounts: [],
  }));
  const tools = {
    get_account_balances: {
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
  const revise = vi.fn<AsyncStub<ActionsService["revise"]>>(async () => {
    throw new Error("Unexpected correction");
  });
  const unobserve = vi.fn();
  const observe = vi.fn<ActionsService["observe"]>(() => unobserve);
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
      { provide: ActionsService, useValue: { prepare, get, revise, observe } },
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
  let listening: Promise<void> | undefined;
  const listen = () => {
    listening = run.listen(controller.signal, async (event) => {
      events.push(event);
    });
    return listening;
  };
  if (attachObserver) listen();
  const responses = () =>
    socket.sent.filter((event) => event.type === "response.create");
  const begin = async (item = "audio-1") => {
    const count = responses().length;
    socket.event({ type: "input_audio_buffer.committed", item_id: item });
    await vi.waitFor(() => expect(responses().length).toBe(count + 1));
    socket.event({
      type: "response.created",
      response: { id: item, metadata: { voiceItem: item } },
    });
  };
  const finish = async (item = "audio-1") => {
    const count = store.finish.mutate.mock.calls.length;
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
    await vi.waitFor(() =>
      expect(store.finish.mutate).toHaveBeenCalledTimes(count + 1),
    );
  };
  return {
    socket,
    run,
    conversationId,
    saved,
    store,
    events,
    responses,
    execute,
    prepare,
    get,
    revise,
    unobserve,
    change: (action: FinancialAction) => observe.mock.calls[0][2](action),
    tool: async (name: string, args: unknown, response = "audio-1") => {
      const call = randomUUID();
      socket.event({
        type: "response.output_item.done",
        response_id: response,
        item: {
          type: "function_call",
          call_id: call,
          name,
          arguments: JSON.stringify(args),
        },
      });
      await vi.waitFor(() =>
        expect(
          socket.sent.some(
            (event) =>
              z
                .object({
                  item: z.object({ call_id: z.string().optional() }).optional(),
                })
                .parse(event).item?.call_id === call,
          ),
        ).toBe(true),
      );
    },
    begin,
    finish,
    listen,
    close: async () => {
      controller.abort();
      await run.close();
      await listening;
      await module.close();
    },
  };
}

describe("server-owned native audio conversation", () => {
  it("keeps the session usable after a token-limited answer without replaying a call or confirming the partial reply", async () => {
    const warn = vi
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => {});
    const f = await setup();
    try {
      await f.begin();
      expect(f.responses()[0]).toMatchObject({
        response: { max_output_tokens: 1024 },
      });
      f.socket.event({
        type: "conversation.item.input_audio_transcription.completed",
        item_id: "audio-1",
        transcript: "Pregunta privada que no debe registrarse en logs",
      });
      f.socket.event({
        type: "response.output_audio_transcript.delta",
        response_id: "audio-1",
        delta: "Respuesta privada incompleta",
      });
      f.socket.event({
        type: "response.done",
        response: {
          id: "audio-1",
          status: "incomplete",
          status_details: { reason: "max_output_tokens" },
          usage: { output_tokens: 1024 },
          output: [{ type: "message" }],
        },
      });
      await vi.waitFor(() =>
        expect(f.events).toContainEqual({
          type: "voice_warning",
          code: "output_limit",
        }),
      );
      expect(f.saved[0].status).toBe("failed");
      expect(f.socket.readyState).toBe(WebSocket.OPEN);
      expect(f.responses()).toHaveLength(1);
      expect(f.prepare).not.toHaveBeenCalled();
      expect(f.events.some((event) => event.type === "voice_error")).toBe(
        false,
      );
      const diagnostics = JSON.stringify(warn.mock.calls);
      expect(diagnostics).toContain("max_output_tokens");
      expect(diagnostics).not.toContain("Pregunta privada");
      expect(diagnostics).not.toContain("Respuesta privada");
      await f.begin("next-explicit-audio");
      expect(f.responses()).toHaveLength(2);
    } finally {
      await f.close();
      warn.mockRestore();
    }
  });

  it("delivers a sanitized terminal problem before closing the observation stream", async () => {
    const warn = vi
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => {});
    const f = await setup();
    try {
      await f.begin();
      f.socket.event({
        type: "error",
        error: { code: "secret-provider-financial-diagnostics" },
      });
      await vi.waitFor(() =>
        expect(f.events).toContainEqual({
          type: "voice_error",
          code: "provider_error",
        }),
      );
      expect(
        warn.mock.calls.map(([message]) => JSON.parse(String(message))),
      ).toContainEqual(expect.objectContaining({ reason: "unknown" }));
      expect(JSON.stringify(warn.mock.calls)).not.toContain("secret-provider");
      await vi.waitFor(() => expect(f.saved[0].status).toBe("interrupted"));
    } finally {
      await f.close();
      warn.mockRestore();
    }
  });

  it("logs allowlisted provider schema diagnostics without its free-text message", async () => {
    const warn = vi
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => {});
    const f = await setup();
    try {
      await f.begin();
      f.socket.event({
        type: "error",
        error: {
          type: "invalid_request_error",
          code: "invalid_json_schema",
          param: "session.tools[5].parameters.oneOf",
          message: "private prompt or provider details must not be logged",
        },
      });
      await vi.waitFor(() =>
        expect(f.events).toContainEqual({
          type: "voice_error",
          code: "provider_error",
        }),
      );
      expect(
        warn.mock.calls.map(([message]) => JSON.parse(String(message))),
      ).toContainEqual(
        expect.objectContaining({
          reason: "invalid_json_schema",
          providerType: "invalid_request_error",
          providerParam: "session.tools[5].parameters.oneOf",
        }),
      );
      expect(JSON.stringify(warn.mock.calls)).not.toContain("private prompt");
    } finally {
      await f.close();
      warn.mockRestore();
    }
  });

  it("drains a terminal problem queued before the browser attaches its observation stream", async () => {
    const f = await setup([], false);
    try {
      await f.begin();
      f.socket.event({ type: "error", error: { code: "server_error" } });
      await vi.waitFor(() => expect(f.saved[0].status).toBe("interrupted"));
      await f.listen();
      expect(f.events).toContainEqual({
        type: "voice_error",
        code: "provider_error",
      });
    } finally {
      await f.close();
    }
  });
  it("prepares the budget and its colored new tag as one request and refuses a competing request", async () => {
    const f = await setup();
    f.prepare.mockImplementation(
      async (_owner, conversationId, turnId, request) => ({
        id: randomUUID(),
        conversationId,
        turnId,
        version: 1,
        origin: "assistant",
        request: FinancialActionRequestSchema.parse(request),
        context: { tags: [], movement: null },
        status: "proposed",
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 900000).toISOString(),
        results: [],
      }),
    );
    try {
      await f.begin();
      expect(f.store.begin.mutate.mock.calls[0][0].mode).toBe("voice");
      expect(JSON.stringify(f.responses().at(-1))).toContain("español neutral");
      expect(JSON.stringify(f.responses().at(-1))).not.toContain(
        "acento chileno",
      );
      const request = {
        kind: "create_budget",
        budget: {
          name: "Burger King",
          amount: "100000.00",
          schedule: { period: "monthly", startDate: "2026-12-01" },
          tagIds: [],
          newTags: [{ name: "Burger King", color: "#ef4444" }],
        },
      };
      await f.tool("prepare_financial_action", { action: request });
      await f.tool("prepare_financial_action", {
        action: { kind: "create_tag", tag: { name: "Separate", color: null } },
      });
      expect(f.prepare).toHaveBeenCalledOnce();
      await f.finish();
      expect(f.saved[0].actions).toHaveLength(1);
      expect(f.saved[0].actions[0].request).toEqual(request);
      expect(f.saved[0].actions[0].status).toBe("proposed");
      await f.begin("second");
      await f.tool("prepare_financial_action", { action: request }, "second");
      expect(f.prepare).toHaveBeenCalledOnce();
      expect(JSON.stringify(f.responses().at(-1))).toContain("UNA A LA VEZ");
    } finally {
      await f.close();
    }
  });

  it("corrects the same pending request by voice and receives authoritative acceptance without another model call", async () => {
    const f = await setup();
    const original: FinancialAction = {
      id: randomUUID(),
      version: 1,
      conversationId: f.conversationId,
      turnId: randomUUID(),
      origin: "assistant",
      request: {
        kind: "create_budget",
        budget: {
          name: "Burger King",
          amount: "100000.00",
          tagIds: [],
          newTags: [{ name: "Burger King", color: "#ef4444" }],
          schedule: { period: "monthly", startDate: "2026-12-01" },
        },
      },
      context: { tags: [], movement: null },
      status: "proposed",
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 900000).toISOString(),
      results: [],
    };
    f.saved.push({
      id: original.turnId ?? randomUUID(),
      question: "Prepara el presupuesto rojo de 100 mil",
      text: "Preparé la solicitud. Puedes aceptarla o corregirla.",
      status: "complete",
      sources: [],
      actions: [original],
      createdAt: original.createdAt,
    });
    if (original.request.kind !== "create_budget")
      throw new Error("Expected budget");
    const revised: FinancialAction = {
      ...original,
      version: 2,
      request: {
        kind: "create_budget",
        budget: { ...original.request.budget, amount: "80000.00" },
      },
    };
    f.get.mockResolvedValue(original);
    f.revise.mockImplementation(async () => {
      f.saved[0] = { ...f.saved[0], actions: [revised] };
      f.change(revised);
      return revised;
    });
    try {
      await f.begin();
      await f.tool("revise_financial_proposal", {
        id: original.id,
        version: 1,
        action: revised.request,
      });
      expect(f.revise).toHaveBeenCalledExactlyOnceWith("verified-owner", {
        id: original.id,
        version: 1,
        action: revised.request,
      });
      expect(f.prepare).not.toHaveBeenCalled();
      await f.finish();
      expect(f.events).toContainEqual({
        type: "action_updated",
        action: revised,
      });
      expect(f.saved[1].actions).toEqual([]);
      const budgetId = randomUUID();
      const receipt: FinancialAction = {
        ...revised,
        status: "applied",
        results: [
          {
            id: budgetId,
            title: "Burger King",
            path: `/presupuestos/${budgetId}`,
            outcome: "created",
          },
          {
            id: randomUUID(),
            title: "Burger King",
            path: "/etiquetas",
            outcome: "created",
          },
        ],
      };
      const responses = f.responses().length;
      f.change(receipt);
      expect(f.responses()).toHaveLength(responses);
      await vi.waitFor(() =>
        expect(
          z
            .object({ session: z.object({ instructions: z.string() }) })
            .parse(f.socket.sent.at(-1)).session.instructions,
        ).toContain('"status":"applied"'),
      );
      expect(JSON.stringify(f.socket.sent.at(-1))).toContain("80000.00");
      expect(JSON.stringify(f.socket.sent.at(-1))).toContain("#ef4444");
      f.saved[0] = {
        ...f.saved[0],
        actions: [{ ...revised, status: "stale" }],
      };
      await f.begin("after-acceptance");
      expect(
        z
          .object({ response: z.object({ instructions: z.string() }) })
          .parse(f.responses().at(-1)).response.instructions,
      ).toContain('"status":"applied"');
    } finally {
      await f.close();
    }
    expect(f.unobserve).toHaveBeenCalledOnce();
  });

  it("ignores delayed or failed input transcription after explicit interruption without saving speech or losing the next turn", async () => {
    const f = await setup();
    try {
      await f.begin();
      f.run.interrupt();
      await f.begin("correction");
      expect(f.saved[0]).toMatchObject({
        question: "Consulta por voz",
        text: "",
        status: "interrupted",
      });
      expect(f.saved[0]).not.toHaveProperty("voice");
      f.socket.event({
        type: "conversation.item.input_audio_transcription.completed",
        item_id: "audio-1",
        transcript: "Mensual de cien mil desde diciembre",
      });
      f.socket.event({
        type: "conversation.item.input_audio_transcription.failed",
        item_id: "correction",
      });
      await f.finish("correction");
      expect(f.store.recordVoiceQuestion.mutate).not.toHaveBeenCalled();
      expect(f.saved[0].status).toBe("interrupted");
      expect(f.saved[1].status).toBe("complete");
      expect(f.saved.every((turn) => !turn.voice && !turn.text)).toBe(true);
      expect(JSON.stringify(f.events)).not.toContain("Mensual de cien mil");
    } finally {
      await f.close();
    }
  });

  it("responds to committed AUDIO, runs owned tools and saves only sources/actions/status without any transcription", async () => {
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
          name: "get_account_balances",
          arguments: "{}",
        },
      });
      await vi.waitFor(() =>
        expect(f.execute).toHaveBeenCalledExactlyOnceWith("verified-owner", {}),
      );
      await f.finish();
      expect(f.saved[0]).toMatchObject({
        status: "complete",
        question: "Consulta por voz",
        text: "",
        sources: [{ tool: "get_account_balances" }],
      });
      expect(f.saved[0]).not.toHaveProperty("voice");
      expect(f.store.recordVoiceQuestion.mutate).not.toHaveBeenCalled();
      expect(f.events.some((event) => event.type === "delta")).toBe(false);
      expect(JSON.stringify(f.events)).not.toContain(
        "Puedes revisar tus cuentas",
      );
      expect(f.events.some((event) => event.type === "source")).toBe(true);
      const config = JSON.stringify(
        f.socket.sent.find((event) => event.type === "session.update"),
      );
      expect(config).toContain("prepare_financial_action");
      expect(config).not.toContain("aprobar_accion");
      expect(config).not.toContain("server-key");
    } finally {
      await f.close();
    }
  });

  it("presents only source and proposal cards owned by the active voice turn", async () => {
    const f = await setup();
    const actionId = randomUUID();
    f.prepare.mockImplementation(
      async (_owner, conversationId, turnId, request) => ({
        id: actionId,
        conversationId,
        turnId,
        version: 1,
        origin: "assistant",
        request: FinancialActionRequestSchema.parse(request),
        context: { tags: [], movement: null },
        status: "proposed",
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 900_000).toISOString(),
        results: [],
      }),
    );
    try {
      await f.begin();
      await f.tool("get_account_balances", {});
      await f.tool("prepare_financial_action", {
        action: { kind: "create_tag", tag: { name: "Casa", color: null } },
      });
      await f.tool("present_assistant_item", {
        kind: "source",
        sourceId: "F1",
        actionId: null,
      });
      await f.tool("present_assistant_item", {
        kind: "proposal",
        sourceId: null,
        actionId,
      });
      await f.tool("present_assistant_item", {
        kind: "source",
        sourceId: "F1",
        actionId: randomUUID(),
      });
      await f.tool("present_assistant_item", {
        kind: "source",
        sourceId: "F2",
        actionId: null,
      });
      await f.tool("present_assistant_item", {
        kind: "proposal",
        sourceId: null,
        actionId: randomUUID(),
      });

      expect(f.events.filter((event) => event.type === "presentation")).toEqual(
        [
          {
            type: "presentation",
            turnId: f.saved[0].id,
            presentation: { kind: "source", sourceId: "F1" },
          },
          {
            type: "presentation",
            turnId: f.saved[0].id,
            presentation: { kind: "proposal", actionId },
          },
        ],
      );
      expect(
        JSON.stringify(
          f.socket.sent.find((event) => event.type === "session.update"),
        ),
      ).toContain("present_assistant_item");
      const configuration = z
        .object({
          session: z.object({
            tools: z.array(
              z.object({ name: z.string(), parameters: z.unknown() }),
            ),
          }),
        })
        .parse(f.socket.sent.find((event) => event.type === "session.update"));
      const presentationTool = configuration.session.tools.find(
        (tool) => tool.name === "present_assistant_item",
      );
      expect(presentationTool?.parameters).toMatchObject({
        type: "object",
        properties: {
          kind: { type: "string", enum: ["source", "proposal"] },
          sourceId: { type: ["string", "null"], pattern: "^F[1-8]$" },
          actionId: { type: ["string", "null"], format: "uuid" },
        },
        required: ["kind", "sourceId", "actionId"],
        additionalProperties: false,
      });
      expect(JSON.stringify(presentationTool?.parameters)).not.toContain(
        "oneOf",
      );
    } finally {
      await f.close();
    }
  });

  it("keeps a validated screen selection in bounded session context without granting approval", async () => {
    const f = await setup();
    try {
      await f.begin();
      await f.tool("get_account_balances", {});
      const selected = {
        kind: "source",
        turnId: f.saved[0].id,
        sourceId: "F1",
      } as const;
      expect(f.run.selectScreen(selected)).toBe(true);
      expect(f.run.selectScreen({ ...selected, sourceId: "F8" })).toBe(false);
      await f.finish();
      await f.begin("second");

      const instructions = JSON.stringify(f.responses().at(-1));
      expect(instructions).toContain("Cuentas y saldos");
      expect(instructions).toContain("no prueba de lectura ni aprobación");
      expect(instructions).not.toContain('"accounts"');
    } finally {
      await f.close();
    }
  });

  it("interrupts a slow tool explicitly without ending the session, discards late evidence and accepts a correction", async () => {
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
          name: "get_account_balances",
          arguments: "{}",
        },
      });
      await vi.waitFor(() => expect(f.execute).toHaveBeenCalledOnce());
      const interrupted = f.run.interrupt();
      resolve({ accounts: [] });
      await interrupted;
      await f.begin("correction");
      await vi.waitFor(() => expect(f.responses()).toHaveLength(2));
      expect(f.saved[0].status).toBe("interrupted");
      expect(f.saved[0].sources).toEqual([]);
      expect(f.socket.readyState).toBe(WebSocket.OPEN);
      expect(f.events.filter((event) => event.type === "error")).toEqual([]);
    } finally {
      await f.close();
    }
  });

  it("does not cancel a response on acoustic speech detection alone", async () => {
    const f = await setup();
    try {
      await f.begin();
      f.socket.event({
        type: "input_audio_buffer.speech_started",
        item_id: "unsubmitted-speech",
      });
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(f.saved[0].status).toBe("pending");
      expect(
        f.socket.sent.some((event) => event.type === "response.cancel"),
      ).toBe(false);
      await f.finish();
    } finally {
      await f.close();
    }
  });

  it("treats an empty manual audio commit as a retryable listening state", async () => {
    const f = await setup();
    try {
      f.socket.event({
        type: "error",
        error: { code: "input_audio_buffer_commit_empty" },
      });
      await vi.waitFor(() =>
        expect(f.events).toContainEqual({
          type: "phase",
          state: "listening",
        }),
      );
      expect(f.saved).toEqual([]);
      expect(f.socket.readyState).toBe(WebSocket.OPEN);
      expect(f.events.some((event) => event.type === "voice_error")).toBe(
        false,
      );
    } finally {
      await f.close();
    }
  });

  it("confirms a grounded completed response immediately without waiting for speech-to-text", async () => {
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
      await vi.waitFor(() => expect(f.saved[0].status).toBe("complete"));
      expect(f.saved[0]).not.toHaveProperty("voice");
      expect(f.saved[0].text).toBe("");
      f.socket.event({
        type: "conversation.item.input_audio_transcription.completed",
        item_id: "audio-1",
        transcript: "Mis gastos",
      });
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(f.store.finish.mutate).toHaveBeenCalledOnce();
      expect(f.store.recordVoiceQuestion.mutate).not.toHaveBeenCalled();
      expect(f.saved[0]).not.toHaveProperty("voice");
      expect(JSON.stringify(f.events)).not.toContain("Mis gastos");
    } finally {
      await f.close();
    }
  });

  it("does not replay stored legacy speech into a new provider call but preserves the original records", async () => {
    const legacy: AssistantTurn = {
      id: randomUUID(),
      question: "Consulta por voz",
      text: "Respuesta histórica privada",
      status: "complete",
      voice: { question: "Pregunta histórica privada" },
      sources: [],
      actions: [],
      createdAt: "2026-11-11T00:00:00.000Z",
    };
    const f = await setup([legacy]);
    try {
      expect(
        f.socket.sent.some(
          (event) => event.type === "conversation.item.create",
        ),
      ).toBe(false);
      expect(JSON.stringify(f.socket.sent)).not.toContain("histórica privada");
      expect(f.saved[0]).toEqual(legacy);
      await f.begin();
      expect(JSON.stringify(f.responses())).not.toContain("histórica privada");
      await f.finish();
      expect(f.saved[0]).toEqual(legacy);
    } finally {
      await f.close();
    }
  });

  it("uses native output metadata transiently to reject unsupported claims without retaining the spoken text", async () => {
    const f = await setup();
    try {
      await f.begin();
      f.socket.event({
        type: "response.output_audio_transcript.delta",
        response_id: "audio-1",
        delta: "Tienes 50000 pesos disponibles.",
      });
      f.socket.event({
        type: "response.done",
        response: {
          id: "audio-1",
          status: "completed",
          output: [{ type: "message" }],
        },
      });
      await vi.waitFor(() =>
        expect(f.events).toContainEqual({
          type: "voice_warning",
          code: "turn_unconfirmed",
        }),
      );
      expect(f.saved[0]).toMatchObject({
        status: "failed",
        text: "",
        actions: [],
      });
      expect(f.saved[0]).not.toHaveProperty("voice");
      expect(JSON.stringify(f.events)).not.toContain("50000");
      expect(f.responses()).toHaveLength(1);
      expect(f.socket.readyState).toBe(WebSocket.OPEN);
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
