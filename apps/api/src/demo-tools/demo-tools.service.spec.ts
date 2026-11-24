import {
  DemoDataResetInputSchema,
  DemoTransactionInputSchema,
} from "@lazyfinance/contracts";
import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { testEnvironment } from "../../tests/fixtures/environment";
import type { MockBankService } from "../banking/mock/mock-bank.service";
import type { PersistenceClient } from "../persistence/persistence.client";
import { DemoToolsService } from "./demo-tools.service";

describe("demo tools API gate", () => {
  it("accepts empty mutation bodies but no caller-selected owner", () => {
    expect(DemoDataResetInputSchema.parse(undefined)).toBeUndefined();
    expect(DemoDataResetInputSchema.parse({})).toEqual({});
    expect(
      DemoDataResetInputSchema.safeParse({ userId: "another-user" }).success,
    ).toBe(false);
    expect(DemoTransactionInputSchema.parse(undefined)).toBeUndefined();
    expect(DemoTransactionInputSchema.parse({})).toEqual({});
    for (const input of [
      { userId: "another-user" },
      { accountId: "any" },
      { amount: "1.00" },
    ])
      expect(DemoTransactionInputSchema.safeParse(input).success).toBe(false);
  });

  it("rejects calls without the API enable flag", async () => {
    const user = vi.fn();
    const service = new DemoToolsService(
      testEnvironment(),
      {
        user,
      } as unknown as PersistenceClient,
      {} as MockBankService,
    );
    await expect(service.resetDemoData("verified-user")).rejects.toThrow(
      NotFoundException,
    );
    expect(user).not.toHaveBeenCalled();
    expect(() => service.createInternalTransaction("verified-user")).toThrow(
      NotFoundException,
    );
    expect(() => service.createExternalTransaction("verified-user")).toThrow(
      NotFoundException,
    );
    expect(user).not.toHaveBeenCalled();
  });

  it("forwards only the authenticated internal user when explicitly enabled", async () => {
    const connectionId = "00000000-0000-4000-8000-000000000001";
    const mutate = vi.fn().mockResolvedValue({
      connectionId,
      transactionCount: 12,
      status: "incomplete",
    });
    const finalize = vi.fn().mockResolvedValue({
      connectionId,
      transactionCount: 12,
      status: "ready",
    });
    const user = vi.fn().mockReturnValue({
      demoTools: {
        resetDemoData: { mutate },
        finalizeDemoData: { mutate: finalize },
      },
    });
    const prepare = vi.fn().mockResolvedValue({ status: "complete" });
    const service = new DemoToolsService(
      testEnvironment({ DEMO_TOOLS_ENABLED: true }),
      { user } as unknown as PersistenceClient,
      { prepare } as unknown as MockBankService,
    );
    await expect(service.resetDemoData("verified-user")).resolves.toEqual({
      connectionId,
      transactionCount: 12,
      status: "ready",
    });
    expect(user).toHaveBeenCalledTimes(2);
    expect(user).toHaveBeenCalledWith("verified-user");
    expect(mutate).toHaveBeenCalledExactlyOnceWith();
    expect(prepare).toHaveBeenCalledExactlyOnceWith(
      "verified-user",
      connectionId,
    );
    expect(finalize).toHaveBeenCalledExactlyOnceWith();
  });

  it("forwards both transaction actions only for the authenticated user", async () => {
    const result = {
      transactionCount: 1,
      description: "Compra en feria",
      amount: "10000.00",
    };
    const internal = vi
      .fn()
      .mockResolvedValue({ ...result, transactionCount: 2 });
    const external = vi.fn().mockResolvedValue(result);
    const user = vi.fn().mockReturnValue({
      demoTools: {
        createInternalTransaction: { mutate: internal },
        createExternalTransaction: { mutate: external },
      },
    });
    const service = new DemoToolsService(
      testEnvironment({ DEMO_TOOLS_ENABLED: true }),
      { user } as unknown as PersistenceClient,
      {} as MockBankService,
    );
    await expect(
      service.createInternalTransaction("verified-user"),
    ).resolves.toMatchObject({ transactionCount: 2 });
    await expect(
      service.createExternalTransaction("verified-user"),
    ).resolves.toEqual(result);
    expect(user).toHaveBeenCalledTimes(2);
    expect(user).toHaveBeenNthCalledWith(1, "verified-user");
    expect(user).toHaveBeenNthCalledWith(2, "verified-user");
    expect(internal).toHaveBeenCalledExactlyOnceWith();
    expect(external).toHaveBeenCalledExactlyOnceWith();
  });
});
