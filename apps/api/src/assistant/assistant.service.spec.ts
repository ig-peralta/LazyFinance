import { Test } from "@nestjs/testing";
import { describe, expect, it, vi } from "vitest";
import { testEnvironment } from "../../tests/fixtures/environment";
import { ActionsService } from "../actions/actions.service";
import { EnvironmentService } from "../environment/environment.service";
import { PersistenceClient } from "../persistence/persistence.client";
import { AssistantService } from "./assistant.service";
import { AssistantConsentService } from "./assistant-consent.service";
import { ASSISTANT_RUNTIME, type AssistantRuntime } from "./assistant-runtime";
import { FinancialReads } from "./financial-reads";

describe("text consent admission", () => {
  it("does not create a history lease or invoke model/tools when consent fails or is cancelled during its read", async () => {
    const requireAccepted = vi.fn<AssistantConsentService["requireAccepted"]>(
      async () => {
        throw new Error("Consent unavailable");
      },
    );
    const user = vi.fn();
    const run = vi.fn<AssistantRuntime["run"]>();
    const module = await Test.createTestingModule({
      providers: [
        AssistantService,
        { provide: AssistantConsentService, useValue: { requireAccepted } },
        {
          provide: EnvironmentService,
          useValue: testEnvironment({
            ASSISTANT_PROVIDER: "openai",
            ASSISTANT_MODEL: "test-model",
          }),
        },
        { provide: PersistenceClient, useValue: { user } },
        { provide: ActionsService, useValue: {} },
        { provide: FinancialReads, useValue: {} },
        {
          provide: ASSISTANT_RUNTIME,
          useValue: { run } satisfies AssistantRuntime,
        },
      ],
    }).compile();
    try {
      const service = module.get(AssistantService);
      const controller = new AbortController();
      const input = {
        conversationId: "00000000-0000-4000-8000-000000000001",
        requestId: "00000000-0000-4000-8000-000000000002",
        text: "Hola",
      };
      const emit = vi.fn(async () => {});
      await expect(
        service.stream("owner", input, controller.signal, emit),
      ).rejects.toThrow("Consent unavailable");
      requireAccepted.mockImplementation(async () => {
        controller.abort();
      });
      await expect(
        service.stream("owner", input, controller.signal, emit),
      ).rejects.toThrow();
      expect(requireAccepted).toHaveBeenCalledWith("owner");
      expect(user).not.toHaveBeenCalled();
      expect(run).not.toHaveBeenCalled();
      expect(emit).not.toHaveBeenCalled();
    } finally {
      await module.close();
    }
  });
});
