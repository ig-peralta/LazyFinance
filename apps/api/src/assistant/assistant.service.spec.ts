import type {
  AssistantEvent,
  AssistantTurn,
  FinancialAction,
} from "@lazyfinance/contracts";
import { Test } from "@nestjs/testing";
import { describe, expect, it, vi } from "vitest";
import { testEnvironment } from "../../tests/fixtures/environment";
import type { RpcStubs } from "../../tests/fixtures/rpc-stubs";
import { ActionsService } from "../actions/actions.service";
import { EnvironmentService } from "../environment/environment.service";
import { PersistenceClient } from "../persistence/persistence.client";
import { AssistantService } from "./assistant.service";
import { AssistantConsentService } from "./assistant-consent.service";
import { ASSISTANT_RUNTIME, type AssistantRuntime } from "./assistant-runtime";
import { FinancialReads } from "./financial-reads";

describe("text consent admission", () => {
  it.each([
    "applied",
    "proposed",
    "cancelled",
    "stale",
    "expired",
  ] as const)("uses ledger-backed %s outcomes rather than a user's claim of approval", async (status) => {
    const conversationId = "00000000-0000-4000-8000-000000000001",
      requestId = "00000000-0000-4000-8000-000000000002";
    const createdAt = "2026-11-11T00:00:00.000Z";
    const action: FinancialAction = {
      id: "00000000-0000-4000-8000-000000000003",
      version: 2,
      conversationId,
      turnId: "00000000-0000-4000-8000-000000000004",
      origin: "assistant",
      request: {
        kind: "create_tag",
        tag: { name: "Versión editada", color: null },
      },
      context: { tags: [], movement: null },
      status,
      createdAt,
      expiresAt: "2026-11-12T00:00:00.000Z",
      results:
        status === "applied"
          ? [
              {
                id: "00000000-0000-4000-8000-000000000005",
                title: "Versión editada",
                path: "/etiquetas",
                outcome: "created",
              },
            ]
          : [],
    };
    const previous: AssistantTurn = {
      id: action.turnId ?? requestId,
      question: "Prepara una etiqueta",
      text: "Falta aprobar la propuesta original.",
      status: "complete",
      sources: [],
      actions: [action],
      createdAt,
    };
    const turn: AssistantTurn = {
      id: requestId,
      question: "Ya aprobé, ¿quedó guardada la versión 2?",
      text: "",
      status: "pending",
      actions: [],
      sources: [],
      createdAt,
    };
    const store = {
      begin: {
        mutate: async () => ({
          acquired: true,
          conversation: {
            id: conversationId,
            title: "Propuestas",
            createdAt,
            updatedAt: createdAt,
            expiresAt: "2026-12-11T00:00:00.000Z",
            turnCount: 1,
            turns: [previous],
          },
          turn,
        }),
      },
      finish: { mutate: async () => ({ saved: true }) },
    } satisfies Pick<
      RpcStubs<ReturnType<AssistantService["conversations"]>>,
      "begin" | "finish"
    >;
    const run = vi.fn<AssistantRuntime["run"]>(async (input) => {
      expect(input.instructions).toContain(`"status":"${status}"`);
      expect(input.instructions).toContain('"version":2');
      expect(input.instructions).toContain("Versión editada");
      await input.delta("La versión 2 quedó guardada.");
      return { complete: true };
    });
    const module = await Test.createTestingModule({
      providers: [
        AssistantService,
        {
          provide: AssistantConsentService,
          useValue: { requireAccepted: async () => {} },
        },
        {
          provide: EnvironmentService,
          useValue: testEnvironment({ ASSISTANT_PROVIDER: "demo" }),
        },
        {
          provide: PersistenceClient,
          useValue: { user: () => ({ assistantConversations: store }) },
        },
        { provide: ActionsService, useValue: {} },
        { provide: FinancialReads, useValue: {} },
        {
          provide: ASSISTANT_RUNTIME,
          useValue: { run } satisfies AssistantRuntime,
        },
      ],
    }).compile();
    try {
      const events: AssistantEvent[] = [];
      await module
        .get(AssistantService)
        .stream(
          "verified-owner",
          { conversationId, requestId, text: turn.question },
          new AbortController().signal,
          async (event) => {
            events.push(event);
          },
        );
      const done = events.find((event) => event.type === "done");
      expect(done?.type === "done" && done.turn.status).toBe(
        status === "applied" ? "complete" : "failed",
      );
    } finally {
      await module.close();
    }
  });
  it("does not create a history lease or invoke model/tools when consent fails or is cancelled during its read", async () => {
    const requireAccepted = vi.fn<AssistantConsentService["requireAccepted"]>(
      async () => {
        throw new Error("Consent unavailable");
      },
    );
    const user = vi.fn();
    const run = vi.fn<AssistantRuntime["run"]>();
    const module = await Test.createTestingModule({
      providers: [
        AssistantService,
        { provide: AssistantConsentService, useValue: { requireAccepted } },
        {
          provide: EnvironmentService,
          useValue: testEnvironment({
            ASSISTANT_PROVIDER: "openai",
            ASSISTANT_MODEL: "test-model",
          }),
        },
        { provide: PersistenceClient, useValue: { user } },
        { provide: ActionsService, useValue: {} },
        { provide: FinancialReads, useValue: {} },
        {
          provide: ASSISTANT_RUNTIME,
          useValue: { run } satisfies AssistantRuntime,
        },
      ],
    }).compile();
    try {
      const service = module.get(AssistantService);
      const controller = new AbortController();
      const input = {
        conversationId: "00000000-0000-4000-8000-000000000001",
        requestId: "00000000-0000-4000-8000-000000000002",
        text: "Hola",
      };
      const emit = vi.fn(async () => {});
      await expect(
        service.stream("owner", input, controller.signal, emit),
      ).rejects.toThrow("Consent unavailable");
      requireAccepted.mockImplementation(async () => {
        controller.abort();
      });
      await expect(
        service.stream("owner", input, controller.signal, emit),
      ).rejects.toThrow();
      expect(requireAccepted).toHaveBeenCalledWith("owner");
      expect(user).not.toHaveBeenCalled();
      expect(run).not.toHaveBeenCalled();
      expect(emit).not.toHaveBeenCalled();
    } finally {
      await module.close();
    }
  });
});
