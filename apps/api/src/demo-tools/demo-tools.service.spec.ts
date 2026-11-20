import {
  DemoDataResetInputSchema,
  DemoTransactionInputSchema,
} from "@lazyfinance/contracts";
import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { testEnvironment } from "../../tests/fixtures/environment";
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
    const service = new DemoToolsService(testEnvironment(), {
      user,
    } as unknown as PersistenceClient);
    expect(() => service.resetDemoData("verified-user")).toThrow(
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
    const mutate = vi.fn().mockResolvedValue({ transactionCount: 12 });
    const user = vi
      .fn()
      .mockReturnValue({ demoTools: { resetDemoData: { mutate } } });
    const service = new DemoToolsService(
      testEnvironment({ DEMO_TOOLS_ENABLED: true }),
      { user } as unknown as PersistenceClient,
    );
    await expect(service.resetDemoData("verified-user")).resolves.toEqual({
      transactionCount: 12,
    });
    expect(user).toHaveBeenCalledExactlyOnceWith("verified-user");
    expect(mutate).toHaveBeenCalledExactlyOnceWith();
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
