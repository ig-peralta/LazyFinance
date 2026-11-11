import { randomUUID } from "node:crypto";
import type {
  AssistantEvent,
  AssistantTurn,
  FinancialAction,
} from "@lazyfinance/contracts";
import { Test } from "@nestjs/testing";
import { describe, expect, it, vi } from "vitest";
import type { AsyncStub } from "../../tests/fixtures/rpc-stubs";
import { ActionsService } from "../actions/actions.service";
import { AssistantTurnTools } from "./assistant-turn-tools";
import { FinancialReads } from "./financial-reads";

const action = (): FinancialAction => ({
  id: randomUUID(),
  version: 1,
  conversationId: randomUUID(),
  turnId: randomUUID(),
  origin: "assistant",
  request: {
    kind: "create_tag",
    tag: { name: "Burger King", color: "#ef4444" },
  },
  context: { tags: [], movement: null },
  status: "proposed",
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 900000).toISOString(),
  results: [],
});

async function setup(current = action()) {
  const prepare = vi.fn<AsyncStub<ActionsService["prepare"]>>(
    async () => current,
  );
  const get = vi.fn<AsyncStub<ActionsService["get"]>>(async () => current);
  const revise = vi.fn<AsyncStub<ActionsService["revise"]>>(async () => ({
    ...current,
    version: 2,
  }));
  const module = await Test.createTestingModule({
    providers: [
      { provide: ActionsService, useValue: { prepare, get, revise } },
      { provide: FinancialReads, useValue: { tools: {} } },
    ],
  }).compile();
  const controller = new AbortController();
  const events: AssistantEvent[] = [];
  const tools = new AssistantTurnTools(
    "owner",
    current.conversationId ?? "",
    randomUUID(),
    module.get(FinancialReads),
    module.get(ActionsService),
    controller.signal,
    async (event) => {
      events.push(event);
    },
  );
  return {
    current,
    tools,
    prepare,
    get,
    revise,
    controller,
    events,
    close: () => module.close(),
  };
}

describe("shared text/voice request review authority", () => {
  it.each([
    "foreign",
    "applied",
    "cancelled",
    "version",
    "kind",
  ] as const)("refuses a %s correction before any proposal mutation", async (reason) => {
    const f = await setup();
    const current = { ...f.current };
    if (reason === "foreign") current.conversationId = randomUUID();
    if (reason === "applied" || reason === "cancelled") current.status = reason;
    f.get.mockResolvedValue(current);
    try {
      await expect(
        f.tools.revise({
          id: current.id,
          version: reason === "version" ? 2 : 1,
          action:
            reason === "kind"
              ? { kind: "archive_tag", id: current.id }
              : current.request,
        }),
      ).rejects.toThrow();
      expect(f.revise).not.toHaveBeenCalled();
      expect(f.prepare).not.toHaveBeenCalled();
    } finally {
      await f.close();
    }
  });

  it("revises an owned pending request without a new proposal, approval or reassigned turn", async () => {
    const f = await setup();
    try {
      const result = await f.tools.revise({
        id: f.current.id,
        version: 1,
        action: f.current.request,
      });
      expect(result).toMatchObject({
        id: f.current.id,
        turnId: f.current.turnId,
        version: 2,
        status: "proposed",
      });
      expect(f.tools.actions).toEqual([]);
      expect(f.tools.revisions).toEqual([result]);
      expect(f.events).toEqual([{ type: "action_updated", action: result }]);
      expect(f.prepare).not.toHaveBeenCalled();
    } finally {
      await f.close();
    }
  });

  it("retains a confirmed correction after in-flight interruption without replaying it", async () => {
    const f = await setup();
    f.revise.mockImplementation(async () => {
      f.controller.abort();
      return { ...f.current, version: 2 };
    });
    try {
      await expect(
        f.tools.revise({
          id: f.current.id,
          version: 1,
          action: f.current.request,
        }),
      ).rejects.toThrow();
      expect(f.tools.revisions[0].version).toBe(2);
      expect(f.revise).toHaveBeenCalledOnce();
      expect(f.events).toEqual([]);
    } finally {
      await f.close();
    }
  });

  it("waits for the pending request to be resolved instead of preparing a competing request", async () => {
    const f = await setup();
    const previous: AssistantTurn = {
      id: f.current.turnId ?? randomUUID(),
      question: "Crea la etiqueta roja",
      text: "Preparé la solicitud",
      status: "complete",
      sources: [],
      actions: [f.current],
      createdAt: f.current.createdAt,
    };
    try {
      f.tools.observeHistory([previous]);
      await expect(f.tools.propose(f.current.request)).rejects.toThrow(
        /una solicitud a la vez/,
      );
      expect(f.prepare).not.toHaveBeenCalled();
    } finally {
      await f.close();
    }
  });

  it("does not retry an uncertain preparation or allow concurrent competing requests", async () => {
    const f = await setup();
    f.prepare.mockRejectedValueOnce(
      new Error("The reply may have been lost after commit"),
    );
    try {
      const results = await Promise.allSettled([
        f.tools.propose(f.current.request),
        f.tools.propose(f.current.request),
      ]);
      expect(results.map((result) => result.status)).toEqual([
        "rejected",
        "rejected",
      ]);
      await expect(f.tools.propose(f.current.request)).rejects.toThrow(
        /no se reenviará/,
      );
      expect(f.prepare).toHaveBeenCalledOnce();
    } finally {
      await f.close();
    }
  });
});
