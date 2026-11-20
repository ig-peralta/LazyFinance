import { DemoDataResetInputSchema } from "@lazyfinance/contracts";
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
});
