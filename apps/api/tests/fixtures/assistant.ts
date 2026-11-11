import { randomUUID } from "node:crypto";
import {
  type AssistantEvent,
  AssistantEventSchema,
  type AssistantTurn,
} from "@lazyfinance/contracts";
import { vi } from "vitest";
import type { AssistantRuntime } from "../../src/assistant/assistant-runtime";
import type { EnvironmentVariables } from "../../src/environment/environment.schema";
import { testEnvironment } from "./environment";
import { fixture, startApi } from "./persistence";

export async function assistantFixture(
  run: AssistantRuntime["run"] = async (input) => {
    await input.read("consultar_saldos_cuentas", {});
    await input.delta(
      "Estos son los saldos reportados, con sus fechas de sincronización. Puedes revisarlos en la referencia adjunta.",
    );
    return { complete: true };
  },
  enabled = true,
  overrides: Partial<EnvironmentVariables> = {},
) {
  const f = await fixture(true);
  f.environment = testEnvironment({
    ASSISTANT_PROVIDER: enabled ? "demo" : "disabled",
    ...overrides,
  });
  const runtime = { run: vi.fn(run) } satisfies AssistantRuntime;
  let api: Awaited<ReturnType<typeof startApi>>;
  try {
    api = await startApi(f, false, undefined, 0, undefined, {
      assistantRuntime: runtime,
    });
  } catch (error) {
    await f.db.close();
    throw error;
  }

  const send = async (
    conversationId: string,
    text = "¿Qué saldos tengo?",
    requestId: string = randomUUID(),
    token: string = f.token,
  ) => {
    const response = await fetch(`${api.url}/assistant/turns`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ conversationId, requestId, text }),
    });
    const body = await response.text();
    const events = response.ok
      ? body
          .trim()
          .split("\n")
          .filter(Boolean)
          .map((line) => AssistantEventSchema.parse(JSON.parse(line)))
      : [];
    return { response, events, body, requestId };
  };
  const done = (events: AssistantEvent[]): AssistantTurn => {
    const event = events.findLast((event) => event.type === "done");
    if (!event || event.type !== "done")
      throw new Error("Missing confirmed answer");
    return event.turn;
  };
  return {
    ...f,
    api,
    runtime,
    send,
    done,
    close: async () => {
      try {
        await api.app.close();
      } finally {
        await f.db.close();
      }
    },
  };
}
