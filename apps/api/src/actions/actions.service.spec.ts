import {
  type FinancialAction,
  FinancialActionRequestSchema,
} from "@lazyfinance/contracts";
import { Test } from "@nestjs/testing";
import { describe, expect, it, vi } from "vitest";
import type { RpcStubs } from "../../tests/fixtures/rpc-stubs";
import { PersistenceClient } from "../persistence/persistence.client";
import { ActionsService } from "./actions.service";

type ActionsClient = RpcStubs<
  ReturnType<PersistenceClient["user"]>["financialActions"]
>;

describe("MCP financial action replay across schedule boundaries", () => {
  it("notifies only the owning conversation after a confirmed approval and isolates observer failures", async () => {
    const action: FinancialAction = {
      id: "00000000-0000-4000-8000-000000000009",
      version: 2,
      conversationId: "00000000-0000-4000-8000-000000000001",
      turnId: "00000000-0000-4000-8000-000000000002",
      origin: "assistant",
      request: {
        kind: "create_tag",
        tag: { name: "Burger King", color: "#ef4444" },
      },
      context: { tags: [], movement: null },
      status: "applied",
      results: [
        {
          id: "00000000-0000-4000-8000-000000000003",
          title: "Burger King",
          path: "/etiquetas",
          outcome: "created",
        },
      ],
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 900000).toISOString(),
    };
    let confirm: (action: FinancialAction) => void = () => {
      throw new Error("Not initialized");
    };
    const committed = new Promise<FinancialAction>((resolve) => {
      confirm = resolve;
    });
    const apply = vi.fn<ActionsClient["apply"]["mutate"]>(
      async () => committed,
    );
    const store = {
      get: { query: async () => action },
      apply: { mutate: apply },
    } satisfies Pick<ActionsClient, "get" | "apply">;
    const module = await Test.createTestingModule({
      providers: [
        ActionsService,
        {
          provide: PersistenceClient,
          useValue: { user: () => ({ financialActions: store }) },
        },
      ],
    }).compile();
    try {
      const service = module.get(ActionsService);
      const same = vi.fn(),
        foreign = vi.fn();
      const stop = service.observe("owner", action.conversationId ?? "", same);
      service.observe("foreign", action.conversationId ?? "", foreign);
      service.observe("owner", "other-chat", foreign);
      service.observe("owner", action.conversationId ?? "", () => {
        throw new Error("Closed media");
      });
      const approving = service.approve("owner", { id: action.id, version: 2 });
      await vi.waitFor(() => expect(apply).toHaveBeenCalledOnce());
      expect(same).not.toHaveBeenCalled();
      confirm(action);
      expect(await approving).toEqual(action);
      expect(same).toHaveBeenCalledExactlyOnceWith(action);
      expect(foreign).not.toHaveBeenCalled();
      stop();
      await service.approve("owner", { id: action.id, version: 2 });
      expect(same).toHaveBeenCalledOnce();
    } finally {
      await module.close();
    }
  });
  it("still looks up an identical durable receipt when its original budget period is no longer creatable", async () => {
    const requestId = "00000000-0000-4000-8000-000000000001";
    const action = FinancialActionRequestSchema.parse({
      kind: "create_budget",
      budget: {
        name: "Original budget",
        amount: "1000.00",
        newTags: [{ name: "Original tag" }],
        schedule: { period: "monthly", startDate: "2000-01-01" },
      },
    });
    if (action.kind !== "create_budget")
      throw new Error("Expected budget fixture");
    const receipt: FinancialAction = {
      id: requestId,
      version: 1,
      conversationId: null,
      turnId: null,
      origin: "mcp",
      request: action,
      context: { tags: [], movement: null },
      status: "applied",
      createdAt: "2000-01-02T00:00:00.000Z",
      expiresAt: "2000-01-02T00:15:00.000Z",
      results: [],
    };
    const execute = vi.fn<ActionsClient["execute"]["mutate"]>(
      async () => receipt,
    );
    const persistence = {
      user: () => ({ financialActions: { execute: { mutate: execute } } }),
    };
    const service = new ActionsService(
      persistence as unknown as PersistenceClient,
    );
    expect(
      await service.execute("owner", "grant", "client", {
        requestId,
        action: { ...action, budget: { ...action.budget, amount: "1000" } },
      }),
    ).toEqual(receipt);
    expect(execute).toHaveBeenCalledExactlyOnceWith({
      input: { requestId, action },
      command: null,
      grantId: "grant",
      clientId: "client",
    });
  });
});
