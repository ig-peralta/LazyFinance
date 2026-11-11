import { Test } from "@nestjs/testing";
import { describe, expect, it, vi } from "vitest";
import { FintocImportService } from "../../../src/banking/fintoc/import/fintoc-import.service";
import { BankingLinksRpc } from "../../../src/banking/linking/banking-links.rpc";
import { BankingSchedulingModule } from "../../../src/banking/scheduling/banking-scheduling.module";
import { BankingSyncRunner } from "../../../src/banking/scheduling/banking-sync-runner";
import { EnvironmentService } from "../../../src/environment/environment.service";
import { PersistenceClient } from "../../../src/persistence/persistence.client";
import { fintocEnvironment } from "../../fixtures/banking/fintoc";

describe("portable headless bank synchronization composition", () => {
  it("initializes without HTTP, public auth, banking routers or background work when disabled", async () => {
    const claim = vi.fn();
    const module = await Test.createTestingModule({
      imports: [BankingSchedulingModule],
    })
      .overrideProvider(EnvironmentService)
      .useValue(fintocEnvironment())
      .overrideProvider(PersistenceClient)
      .useValue({
        bankingScheduler: () => ({
          providerScheduler: { claim: { mutate: claim } },
        }),
      })
      .compile();
    try {
      await module.init();
      expect(module.get(FintocImportService)).toBeInstanceOf(
        FintocImportService,
      );
      expect(() => module.get(BankingLinksRpc)).toThrow();
      await module.get(BankingSyncRunner).runOnce();
      expect(claim).not.toHaveBeenCalled();
    } finally {
      await module.close();
    }
  });
});
