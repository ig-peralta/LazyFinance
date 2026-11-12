import { randomUUID } from "node:crypto";
import {
  AssistantSourceSchema,
  type AssistantTurn,
  AssistantTurnSchema,
  type FinancialAction,
} from "@lazyfinance/contracts";
import { describe, expect, it } from "vitest";
import { testEnvironment } from "../../tests/fixtures/environment";
import { ENV_SCHEMA } from "../environment/environment.schema";
import {
  assistantActionContext,
  assistantHistory,
  assistantInstructions,
} from "./assistant-policy";
import { assistantModel } from "./assistant-runtime";

const turn = (
  status: AssistantTurn["status"] = "complete",
  size = 10,
): AssistantTurn => ({
  id: randomUUID(),
  question: "¿Mis ingresos?",
  text: "a".repeat(size),
  sources: [],
  actions: [],
  status,
  createdAt: "2026-11-08T18:00:00.000Z",
});

describe("provider-neutral assistant configuration and bounded context", () => {
  const action = (
    status: FinancialAction["status"],
    version = 1,
  ): FinancialAction => ({
    id: randomUUID(),
    version,
    conversationId: randomUUID(),
    turnId: randomUUID(),
    origin: "assistant",
    request: {
      kind: "create_tag",
      tag: { name: `Versión ${version}`, color: null },
    },
    context: { tags: [], movement: null },
    status,
    createdAt: "2026-11-11T00:00:00.000Z",
    expiresAt: "2026-11-12T00:00:00.000Z",
    results:
      status === "applied"
        ? [
            {
              id: randomUUID(),
              title: `Versión ${version}`,
              path: "/etiquetas",
              outcome: "created",
            },
          ]
        : [],
  });

  it.each([
    "applied",
    "cancelled",
    "stale",
    "expired",
    "proposed",
  ] as const)("supplies authoritative %s outcomes beyond recent completed messages without inventing execution", (status) => {
    const proposal = { ...turn("interrupted"), actions: [action(status, 2)] };
    const turns = [proposal, ...Array.from({ length: 12 }, () => turn())];
    expect(
      assistantHistory(turns).some((message) =>
        message.content.includes(proposal.actions[0].id),
      ),
    ).toBe(false);
    const current = assistantActionContext(turns);
    expect(current).toContain(proposal.actions[0].id);
    expect(current).toContain(`"status":"${status}"`);
    expect(current).toContain('"version":2');
    expect(current).toContain("Versión 2");
    expect(current).toContain(
      status === "applied" ? '"outcome":"created"' : '"results":[]',
    );
  });

  it("uses readable voice questions within voice follow-ups and describes a missing saved proposal explicitly", () => {
    const voice = {
      ...turn(),
      question: "Consulta por voz",
      voice: { question: "¿Y octubre?" },
    };
    expect(assistantHistory([voice])[0].content).toBe("¿Y octubre?");
    expect(assistantActionContext([])).toContain(
      "no hay ninguna solicitud guardada",
    );
    expect(assistantActionContext([])).toContain("NO prueba que exista");
    expect(assistantActionContext([])).toContain("No inventes una tarjeta");
  });

  it("requires neutral Spanish and tagged objectives without changing Santiago/CLP semantics", () => {
    const instructions = assistantInstructions(
      new Date("2026-11-11T22:00:00Z"),
    );
    expect(instructions).toContain("español neutral");
    expect(instructions).toContain("sin regionalismos ni jerga chilena");
    expect(instructions).not.toContain("español de Chile");
    expect(instructions).toContain("America/Santiago");
    expect(instructions).toContain("Moneda CLP");
    expect(instructions).toContain("sin etiquetas NO es una opción");
    expect(instructions).toContain("list_tags no prepara nada");
    expect(instructions).toContain(
      "get_financial_action_status vuelve a mostrar su tarjeta actual",
    );
  });
  it("requires the current turn and source shapes instead of upgrading earlier development formats", () => {
    const current = turn();
    expect(AssistantTurnSchema.safeParse(current).success).toBe(true);
    const { actions, ...missingActions } = current;
    expect(AssistantTurnSchema.safeParse(missingActions).success).toBe(false);
    const source = {
      id: "F1",
      tool: "list_tags",
      title: "Etiquetas",
      status: "available",
      queriedAt: current.createdAt,
      month: null,
      path: "/etiquetas",
      recordId: null,
      note: "Consulta guardada",
      data: { tags: [] },
    };
    expect(AssistantSourceSchema.safeParse(source).success).toBe(true);
    const { recordId, ...missingTarget } = source;
    expect(AssistantSourceSchema.safeParse(missingTarget).success).toBe(false);
  });

  it("defaults closed and forbids demonstration in production or partial live configuration", () => {
    expect(ENV_SCHEMA.parse({}).ASSISTANT_PROVIDER).toBe("disabled");
    expect(
      ENV_SCHEMA.safeParse({
        NODE_ENV: "production",
        AUTH_PROVIDER: "firebase",
        FIREBASE_PROJECT_ID: "fixture",
        ASSISTANT_PROVIDER: "demo",
      }).success,
    ).toBe(false);
    for (const provider of [
      "openai",
      "anthropic",
      "google",
      "openai-compatible",
    ])
      expect(
        ENV_SCHEMA.safeParse({ ASSISTANT_PROVIDER: provider }).success,
      ).toBe(false);
  });

  it("admits explicitly configured compatible loopback only in development, with no URL credentials or query injection", () => {
    const base = {
      ASSISTANT_PROVIDER: "openai-compatible",
      ASSISTANT_MODEL: "fixture-model",
    };
    expect(
      ENV_SCHEMA.safeParse({
        ...base,
        ASSISTANT_BASE_URL: "http://127.0.0.1:11434/v1",
      }).success,
    ).toBe(true);
    for (const url of [
      "http://untrusted.test/v1",
      "https://key:secret@models.test/v1",
      "https://models.test/v1?key=secret",
      "https://models.test/v1#test",
    ])
      expect(
        ENV_SCHEMA.safeParse({ ...base, ASSISTANT_BASE_URL: url }).success,
      ).toBe(false);
  });

  it.each([
    "openai",
    "anthropic",
    "google",
    "openai-compatible",
  ] as const)("constructs the %s adapter without a provider-specific conversation contract or any network call", async (provider) => {
    const environment = testEnvironment({
      ASSISTANT_PROVIDER: provider,
      ASSISTANT_MODEL: "fixture-model",
      ASSISTANT_API_KEY: "fixture-api-key",
      ...(provider === "openai-compatible"
        ? { ASSISTANT_BASE_URL: "https://models.example/v1" }
        : {}),
    });
    const model = await assistantModel(environment, async () => {
      throw new Error("No network allowed during model construction");
    });
    expect(typeof model).toBe("object");
    if (typeof model === "string")
      throw new Error("Unexpected gateway default");
    expect(model.modelId).toBe("fixture-model");
    expect(model.specificationVersion).toBe("v4");
  });

  it("keeps completed answers and unfinished user intent within the shared context budget", () => {
    const turns = Array.from({ length: 20 }, () => turn());
    const history = assistantHistory([
      ...turns,
      turn("failed"),
      turn("interrupted"),
      turn("pending"),
    ]);
    expect(history).toHaveLength(14);
    expect(history[0].role).toBe("user");
    expect(
      assistantHistory(
        Array.from({ length: 24 }, () => turn("complete", 16000)),
      ).reduce((total, item) => total + item.content.length, 0),
    ).toBeLessThanOrEqual(32000);
    const prompt = assistantInstructions(new Date("2026-11-09T00:30:00Z"));
    expect(prompt).toContain("America/Santiago");
    expect(prompt).toContain("NO son dinero disponible");
    expect(prompt).toContain("períodos parciales equivalentes");
    expect(prompt).toContain(
      "muestra las referencias por separado como tarjetas",
    );
    expect(prompt).toContain("no incluyas códigos de fuente");
  });

  it("retains interrupted voice corrections and failed text questions, never their unconfirmed answers or missing transcripts", () => {
    const history = assistantHistory([
      {
        ...turn("interrupted"),
        question: "Consulta por voz",
        voice: { question: "Mensual, de cien mil, desde el próximo mes" },
        text: "Invented unfinished answer",
      },
      {
        ...turn("failed"),
        question: "Usa una etiqueta Burger King roja",
        text: "False success",
      },
      {
        ...turn("interrupted"),
        voice: {
          question: "Audio interrumpido · transcripción no disponible",
          transcriptionPending: true,
        },
      },
    ]);
    expect(history).toEqual([
      { role: "user", content: "Mensual, de cien mil, desde el próximo mes" },
      { role: "user", content: "Usa una etiqueta Burger King roja" },
    ]);
    const prompt = assistantInstructions(new Date("2026-12-01T02:30:00Z"));
    expect(prompt).toContain("2026-11-30 23:30:00");
    expect(prompt).toContain("mes actual 2026-11");
    expect(prompt).toContain("UNA A LA VEZ");
    expect(prompt).toContain("budget.newTags");
    expect(prompt).toContain("pregunta qué color quiere");
    expect(prompt).toContain("revise_financial_proposal");
    expect(prompt).toContain(
      "Puedes aceptarla en la tarjeta o decirme qué corregir",
    );
  });
});
