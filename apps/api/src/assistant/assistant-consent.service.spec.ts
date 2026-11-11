import type { StoredAssistantConsent } from "@lazyfinance/contracts/internal";
import { Test } from "@nestjs/testing";
import { describe, expect, it, vi } from "vitest";
import { testEnvironment } from "../../tests/fixtures/environment";
import type { RpcStubs } from "../../tests/fixtures/rpc-stubs";
import type { EnvironmentVariables } from "../environment/environment.schema";
import { EnvironmentService } from "../environment/environment.service";
import { PersistenceClient } from "../persistence/persistence.client";
import { AssistantConsentService } from "./assistant-consent.service";

async function setup(overrides: Partial<EnvironmentVariables> = {}) {
  type Consent = ReturnType<PersistenceClient["user"]>["assistantConsent"];
  const get = vi.fn<RpcStubs<Consent>["get"]["query"]>(async () => null);
  const decide = vi.fn<RpcStubs<Consent>["decide"]["mutate"]>(
    async (input) => ({
      policyKey: input.policyKey,
      decision: input.decision,
      revision: input.expectedRevision + 1,
      decidedAt: "2026-11-11T12:00:00.000Z",
    }),
  );
  const user = vi.fn((_owner: string) => ({
    assistantConsent: { get: { query: get }, decide: { mutate: decide } },
  }));
  const module = await Test.createTestingModule({
    providers: [
      AssistantConsentService,
      {
        provide: EnvironmentService,
        useValue: testEnvironment({
          ASSISTANT_PROVIDER: "openai",
          ASSISTANT_MODEL: "model-a",
          ...overrides,
        }),
      },
      { provide: PersistenceClient, useValue: { user } },
    ],
  }).compile();
  return {
    service: module.get(AssistantConsentService),
    get,
    decide,
    user,
    close: () => module.close(),
  };
}

describe("account external-processing consent", () => {
  it("fails closed for absent/refused/mismatched decisions and retains the stored CAS revision", async () => {
    const f = await setup();
    try {
      const state = await f.service.state("owner");
      expect(state).toMatchObject({
        required: true,
        decision: "unset",
        revision: 0,
        decidedAt: null,
      });
      await expect(f.service.requireAccepted("owner")).rejects.toThrow(
        "consent required",
      );
      const row: StoredAssistantConsent = {
        policyKey: state.policy.key,
        decision: "refused",
        revision: 3,
        decidedAt: "2026-11-11T12:00:00.000Z",
      };
      f.get.mockResolvedValue(row);
      expect(await f.service.state("owner")).toMatchObject({
        decision: "refused",
        revision: 3,
      });
      await expect(f.service.requireAccepted("owner")).rejects.toThrow();
      f.get.mockResolvedValue({ ...row, decision: "accepted" });
      await expect(f.service.requireAccepted("owner")).resolves.toBeUndefined();
      f.get.mockResolvedValue({
        ...row,
        decision: "accepted",
        policyKey: "0".repeat(64),
      });
      expect(await f.service.state("owner")).toMatchObject({
        decision: "unset",
        revision: 3,
        decidedAt: null,
      });
      await expect(f.service.requireAccepted("owner")).rejects.toThrow();
      f.get.mockRejectedValue(new Error("Persistence unavailable"));
      await expect(f.service.requireAccepted("owner")).rejects.toThrow(
        "Persistence unavailable",
      );
    } finally {
      await f.close();
    }
  });

  it("rejects stale policy keys before a write and projects explicit acceptance/refusal", async () => {
    const f = await setup();
    try {
      await expect(
        f.service.decide("owner", {
          policyKey: "0".repeat(64),
          expectedRevision: 0,
          decision: "accepted",
        }),
      ).rejects.toThrow("policy changed");
      expect(f.decide).not.toHaveBeenCalled();
      const { policy } = await f.service.state("owner");
      for (const decision of ["accepted", "refused"] as const) {
        const result = await f.service.decide("owner", {
          policyKey: policy.key,
          expectedRevision: 7,
          decision,
        });
        expect(result).toMatchObject({
          required: true,
          policy,
          decision,
          revision: 8,
        });
      }
      expect(f.user).toHaveBeenCalledWith("owner");
      f.decide.mockRejectedValue(new Error("Conflict"));
      await expect(
        f.service.decide("owner", {
          policyKey: policy.key,
          expectedRevision: 0,
          decision: "accepted",
        }),
      ).rejects.toThrow("Conflict");
    } finally {
      await f.close();
    }
  });

  it("binds provider/model/full compatible endpoint but exposes only the endpoint origin and no keys", async () => {
    const configurations: Partial<EnvironmentVariables>[] = [
      {},
      { ASSISTANT_MODEL: "model-b" },
      { ASSISTANT_PROVIDER: "anthropic" },
      {
        ASSISTANT_PROVIDER: "openai-compatible",
        ASSISTANT_BASE_URL: "https://models.example.test/v1",
      },
      {
        ASSISTANT_PROVIDER: "openai-compatible",
        ASSISTANT_BASE_URL: "https://models.example.test/v2",
      },
    ];
    const keys = new Set<string>();
    for (const configuration of configurations) {
      const f = await setup({
        ...configuration,
        ASSISTANT_API_KEY: "private-key",
      });
      try {
        const state = await f.service.state("owner");
        keys.add(state.policy.key);
        expect(JSON.stringify(state)).not.toContain("private-key");
        expect(state.policy.endpoint).toBe(
          configuration.ASSISTANT_BASE_URL
            ? "https://models.example.test"
            : null,
        );
      } finally {
        await f.close();
      }
    }
    expect(keys.size).toBe(configurations.length);
    const a = await setup({ ASSISTANT_API_KEY: "key-a" }),
      b = await setup({ ASSISTANT_API_KEY: "key-b" });
    try {
      expect((await a.service.state("owner")).policy).toEqual(
        (await b.service.state("owner")).policy,
      );
    } finally {
      await a.close();
      await b.close();
    }
  });

  it.each([
    "disabled",
    "demo",
  ] as const)("exempts %s without reading persistence and refuses decision writes", async (provider) => {
    const f = await setup({ ASSISTANT_PROVIDER: provider });
    try {
      await f.service.requireAccepted("owner");
      expect(await f.service.state("owner")).toMatchObject({
        required: false,
        decision: "unset",
        revision: 0,
      });
      expect(f.get).not.toHaveBeenCalled();
      await expect(
        f.service.decide("owner", {
          policyKey: "0".repeat(64),
          decision: "accepted",
          expectedRevision: 0,
        }),
      ).rejects.toThrow();
      expect(f.decide).not.toHaveBeenCalled();
    } finally {
      await f.close();
    }
  });
});
