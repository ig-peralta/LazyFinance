import {
  type AssistantSource,
  type FinancialAction,
  FinancialActionRequestSchema,
} from "@lazyfinance/contracts";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { testEnvironment } from "../../tests/fixtures/environment";
import {
  AiSdkAssistantRuntime,
  type AssistantRuntimeInput,
} from "./assistant-runtime";

type StreamResult = Awaited<ReturnType<MockLanguageModelV4["doStream"]>>;
type Chunk = StreamResult["stream"] extends ReadableStream<infer T> ? T : never;
type Finish = Extract<Chunk, { type: "finish" }>;
const source: AssistantSource = {
  id: "F1",
  tool: "consultar_saldos_cuentas",
  title: "Cuentas",
  status: "available",
  queriedAt: "2026-11-09T03:00:00.000Z",
  month: null,
  recordId: null,
  path: "/cuentas",
  note: "Saldo reportado; no es hora de sincronización.",
  data: { accounts: [] },
};
const tools = {
  consultar_saldos_cuentas: {
    description: "Consulta saldos propios.",
    inputSchema: z.strictObject({}),
  },
};

function response(
  chunks: Chunk[],
  reason: Finish["finishReason"]["unified"] = "stop",
): StreamResult {
  return {
    stream: new ReadableStream<Chunk>({
      start(controller) {
        controller.enqueue({ type: "stream-start", warnings: [] });
        for (const chunk of chunks) controller.enqueue(chunk);
        controller.enqueue({
          type: "finish",
          finishReason: { unified: reason, raw: reason },
          usage: {
            inputTokens: {
              total: 20,
              noCache: 20,
              cacheRead: 0,
              cacheWrite: 0,
            },
            outputTokens: { total: 10, text: 10, reasoning: 0 },
          },
        });
        controller.close();
      },
    }),
  };
}

function text(value: string): Chunk[] {
  return [
    { type: "text-start", id: "reply" },
    { type: "text-delta", id: "reply", delta: value },
    { type: "text-end", id: "reply" },
  ];
}

function input(): AssistantRuntimeInput {
  return {
    instructions: "Instrucciones confiables",
    messages: [{ role: "user", content: "¿Mis saldos?" }],
    signal: new AbortController().signal,
    read: vi.fn(async () => source),
    delta: vi.fn(async () => {}),
  };
}

describe("actual provider-neutral AI SDK tool loop with controlled models", () => {
  it("executes a validated read, returns its source to the next model step and streams only answer text", async () => {
    const model = new MockLanguageModelV4({
      doStream: [
        response(
          [
            {
              type: "tool-call",
              toolCallId: "call-1",
              toolName: "consultar_saldos_cuentas",
              input: "{}",
            },
          ],
          "tool-calls",
        ),
        response([
          { type: "reasoning-start", id: "private" },
          {
            type: "reasoning-delta",
            id: "private",
            delta: "private reasoning",
          },
          { type: "reasoning-end", id: "private" },
          ...text("No hay cuentas guardadas."),
        ]),
      ],
    });
    const runtime = new AiSdkAssistantRuntime(
      testEnvironment(),
      tools,
      async () => model,
    );
    const request = input();
    expect(await runtime.run(request)).toEqual({ complete: true });
    expect(request.read).toHaveBeenCalledExactlyOnceWith(
      "consultar_saldos_cuentas",
      {},
    );
    expect(request.delta).toHaveBeenCalledExactlyOnceWith(
      "No hay cuentas guardadas.",
    );
    expect(model.doStreamCalls).toHaveLength(2);
    expect(JSON.stringify(model.doStreamCalls[1].prompt)).toContain(
      '"status":"available"',
    );
    expect(model.doStreamCalls[0].prompt[0]).toMatchObject({
      role: "system",
      content: "Instrucciones confiables",
    });
    expect(model.doStreamCalls[0].maxOutputTokens).toBe(3000);
  });

  it("does not execute unknown tools or invalid owner-selection arguments", async () => {
    const model = new MockLanguageModelV4({
      doStream: [
        response(
          [
            {
              type: "tool-call",
              toolCallId: "bad-1",
              toolName: "transfer_money",
              input: "{}",
            },
            {
              type: "tool-call",
              toolCallId: "bad-2",
              toolName: "consultar_saldos_cuentas",
              input: '{"userId":"other"}',
            },
          ],
          "tool-calls",
        ),
        response(text("No puedo realizar esa operación.")),
      ],
    });
    const request = input();
    await new AiSdkAssistantRuntime(
      testEnvironment(),
      tools,
      async () => model,
    ).run(request);
    expect(request.read).not.toHaveBeenCalled();
    expect(model.doStreamCalls).toHaveLength(2);
  });

  it("prepares an object-wrapped proposal, reads its real status and never offers approval or execution", async () => {
    const action: FinancialAction = {
      id: "00000000-0000-4000-8000-000000000009",
      version: 1,
      conversationId: "00000000-0000-4000-8000-000000000001",
      turnId: "00000000-0000-4000-8000-000000000002",
      origin: "assistant",
      request: { kind: "create_tag", tag: { name: "Compras", color: null } },
      context: { tags: [], movement: null },
      status: "proposed",
      createdAt: "2026-11-09T15:00:00.000Z",
      expiresAt: "2026-11-09T15:15:00.000Z",
      results: [],
    };
    const model = new MockLanguageModelV4({
      doStream: [
        response(
          [
            {
              type: "tool-call",
              toolCallId: "prepare",
              toolName: "preparar_accion_financiera",
              input: JSON.stringify({
                action: { kind: "create_tag", tag: { name: "Compras" } },
              }),
            },
          ],
          "tool-calls",
        ),
        response(
          [
            {
              type: "tool-call",
              toolCallId: "status",
              toolName: "consultar_estado_accion",
              input: JSON.stringify({ id: action.id }),
            },
          ],
          "tool-calls",
        ),
        response(
          text(
            "La propuesta sigue pendiente. Usa el botón de la tarjeta para aprobarla.",
          ),
        ),
      ],
    });
    const request = {
      ...input(),
      propose: vi.fn(async () => action),
      actionStatus: vi.fn(async () => action),
    };
    expect(
      await new AiSdkAssistantRuntime(
        testEnvironment(),
        tools,
        async () => model,
      ).run(request),
    ).toEqual({ complete: true });
    expect(request.propose).toHaveBeenCalledExactlyOnceWith(
      FinancialActionRequestSchema.parse({
        kind: "create_tag",
        tag: { name: "Compras" },
      }),
    );
    expect(request.actionStatus).toHaveBeenCalledExactlyOnceWith(action.id);
    expect(request.read).not.toHaveBeenCalled();
    const offered = model.doStreamCalls[0].tools ?? [];
    expect(offered.map((tool) => tool.name).sort()).toEqual([
      "consultar_estado_accion",
      "consultar_saldos_cuentas",
      "preparar_accion_financiera",
    ]);
    expect(
      offered.find((tool) => tool.name === "preparar_accion_financiera"),
    ).toMatchObject({ inputSchema: { type: "object", required: ["action"] } });
    expect(JSON.stringify(model.doStreamCalls[2].prompt)).toContain(
      '"status":"proposed"',
    );
  });

  it("rejects forged approval, ownership overrides and direct execution even when proposal tools are enabled", async () => {
    const model = new MockLanguageModelV4({
      doStream: [
        response(
          [
            {
              type: "tool-call",
              toolCallId: "approval",
              toolName: "aprobar_accion_financiera",
              input: "{}",
            },
            {
              type: "tool-call",
              toolCallId: "execution",
              toolName: "ejecutar_accion_financiera",
              input: "{}",
            },
            {
              type: "tool-call",
              toolCallId: "forged",
              toolName: "preparar_accion_financiera",
              input: JSON.stringify({
                action: { kind: "create_tag", tag: { name: "No guardar" } },
                approved: true,
                userId: "other",
              }),
            },
            {
              type: "tool-call",
              toolCallId: "unwrapped",
              toolName: "preparar_accion_financiera",
              input: JSON.stringify({
                kind: "create_tag",
                tag: { name: "No guardar" },
              }),
            },
          ],
          "tool-calls",
        ),
        response(text("No se aplicó ningún cambio.")),
      ],
    });
    const request = {
      ...input(),
      propose: vi.fn<NonNullable<AssistantRuntimeInput["propose"]>>(),
      actionStatus: vi.fn<NonNullable<AssistantRuntimeInput["actionStatus"]>>(),
    };
    await new AiSdkAssistantRuntime(
      testEnvironment(),
      tools,
      async () => model,
    ).run(request);
    expect(request.propose).not.toHaveBeenCalled();
    expect(request.actionStatus).not.toHaveBeenCalled();
    expect(request.read).not.toHaveBeenCalled();
  });

  it("stops after six model steps and never treats an exhausted tool loop as a completed answer", async () => {
    let index = 0;
    const model = new MockLanguageModelV4({
      doStream: async () =>
        response(
          [
            {
              type: "tool-call",
              toolCallId: `call-${++index}`,
              toolName: "consultar_saldos_cuentas",
              input: "{}",
            },
          ],
          "tool-calls",
        ),
    });
    const request = input();
    expect(
      await new AiSdkAssistantRuntime(
        testEnvironment(),
        tools,
        async () => model,
      ).run(request),
    ).toEqual({ complete: false });
    expect(model.doStreamCalls).toHaveLength(6);
    expect(request.read).toHaveBeenCalledTimes(6);
  });

  it.each([
    "length",
    "content-filter",
    "interrupted",
  ] as const)("marks the %s finish reason incomplete", async (reason) => {
    const model = new MockLanguageModelV4({
      doStream: response(text("Parte de una respuesta"), reason),
    });
    expect(
      await new AiSdkAssistantRuntime(
        testEnvironment(),
        tools,
        async () => model,
      ).run(input()),
    ).toEqual({ complete: false });
  });

  it("sanitizes provider stream errors and makes no automatic model retry", async () => {
    const model = new MockLanguageModelV4({
      doStream: response(
        [{ type: "error", error: new Error("sk-secret-provider") }],
        "error",
      ),
    });
    await expect(
      new AiSdkAssistantRuntime(
        testEnvironment(),
        tools,
        async () => model,
      ).run(input()),
    ).rejects.toThrow("Assistant generation failed");
    expect(model.doStreamCalls).toHaveLength(1);
  });
});
