import { randomUUID } from "node:crypto";
import {
  AssistantSourceSchema,
  type AssistantTurn,
  AssistantTurnSchema,
} from "@lazyfinance/contracts";
import { describe, expect, it } from "vitest";
import { testEnvironment } from "../../tests/fixtures/environment";
import { ENV_SCHEMA } from "../environment/environment.schema";
import { assistantHistory, assistantInstructions } from "./assistant-policy";
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
  it("requires the current turn and source shapes instead of upgrading earlier development formats", () => {
    const current = turn();
    expect(AssistantTurnSchema.safeParse(current).success).toBe(true);
    const { actions, ...missingActions } = current;
    expect(AssistantTurnSchema.safeParse(missingActions).success).toBe(false);
    const source = {
      id: "F1",
      tool: "consultar_etiquetas",
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

  it("keeps only completed server turns, limits historical pairs and does not expose reasoning, raw tools or unfinished answers", () => {
    const turns = Array.from({ length: 20 }, () => turn());
    const history = assistantHistory([
      ...turns,
      turn("failed"),
      turn("interrupted"),
      turn("pending"),
    ]);
    expect(history).toHaveLength(16);
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
});
