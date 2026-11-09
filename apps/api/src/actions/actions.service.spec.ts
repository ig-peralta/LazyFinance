import {
  type FinancialAction,
  FinancialActionRequestSchema,
} from "@lazyfinance/contracts";
import { describe, expect, it, vi } from "vitest";
import type { RpcStubs } from "../../tests/fixtures/rpc-stubs";
import type { PersistenceClient } from "../persistence/persistence.client";
import { ActionsService } from "./actions.service";

type ActionsClient = RpcStubs<
  ReturnType<PersistenceClient["user"]>["financialActions"]
>;

describe("MCP financial action replay across schedule boundaries", () => {
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
