import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { FINTOC_FETCH } from "../../../src/banking/fintoc/client/fintoc-client";
import { FintocRequestAdmission } from "../../../src/banking/fintoc/client/fintoc-request-admission";
import { BankingSchedulingModule } from "../../../src/banking/scheduling/banking-scheduling.module";
import { BankingSyncRunner } from "../../../src/banking/scheduling/banking-sync-runner";
import { BankingSyncTimer } from "../../../src/banking/scheduling/banking-sync-timer";
import { EnvironmentService } from "../../../src/environment/environment.service";
import { fintocAdmission } from "../../fixtures/banking/fintoc";
import {
  fintocAppFixture,
  fintocStoredAccount,
} from "../../fixtures/banking/fintoc-app";
import { testEnvironment } from "../../fixtures/environment";
import { integration } from "../../fixtures/persistence";

describe.skipIf(!integration)("owned selected-account ingestion", () => {
  it("shares a sync failure's durable waiting period with discovery without additional provider reads", async () => {
    const f = await fintocAppFixture();
    try {
      await f.run();
      f.state.failMovements = true;
      f.state.failureStatus = 429;
      f.state.retryAfter = "3600";
      const failed = await f.refresh();
      expect(failed).toMatchObject({ status: "failed", reason: "retryable" });
      const selection = await f.first.banking.accountSelection.query({
        id: f.connected.id,
      });
      expect(Date.parse(selection.readRetryAfter ?? "")).toBeGreaterThan(
        Date.now() + 59 * 60_000,
      );
      f.fetch.mockClear();
      await expect(
        f.first.banking.discoverAccounts.mutate({ id: f.connected.id }),
      ).rejects.toMatchObject({ data: { code: "TOO_MANY_REQUESTS" } });
      expect(await f.refresh()).toMatchObject({ status: "retry_later" });
      expect(f.fetch).not.toHaveBeenCalled();
    } finally {
      await f.close();
    }
  });

  it("retains discovery Retry-After across commands and relink without importing financial data", async () => {
    const f = await fintocAppFixture(undefined, false);
    try {
      f.state.linkFailureStatus = 429;
      f.state.retryAfter = "7200";
      await expect(
        f.first.banking.discoverAccounts.mutate({ id: f.connected.id }),
      ).rejects.toMatchObject({ data: { code: "SERVICE_UNAVAILABLE" } });
      const deferred = await f.first.banking.accountSelection.query({
        id: f.connected.id,
      });
      expect(Date.parse(deferred.readRetryAfter ?? "")).toBeGreaterThan(
        Date.now() + 119 * 60_000,
      );
      expect(deferred).toMatchObject({
        accounts: [],
        accountIds: [],
        confirmedAt: null,
      });
      f.fetch.mockClear();
      await expect(
        f.first.banking.discoverAccounts.mutate({ id: f.connected.id }),
      ).rejects.toMatchObject({ data: { code: "TOO_MANY_REQUESTS" } });
      expect(f.fetch).not.toHaveBeenCalled();
      f.state.linkFailureStatus = null;
      await f.connect(f.connected.id);
      f.fetch.mockClear();
      await expect(
        f.first.banking.discoverAccounts.mutate({ id: f.connected.id }),
      ).rejects.toMatchObject({ data: { code: "TOO_MANY_REQUESTS" } });
      expect(f.fetch).not.toHaveBeenCalled();
      expect(
        await f.db.rows("account", { providerConnectionId: f.connected.id }),
      ).toEqual([]);
      await f.db.update(
        "provider_account_selection",
        f.connected.id,
        { readRetryAfter: new Date(Date.now() - 1).toISOString() },
        "connectionId",
      );
      expect(
        await f.first.banking.discoverAccounts.mutate({ id: f.connected.id }),
      ).toMatchObject({
        discoveryVersion: 1,
        accountIds: [],
        confirmedAt: null,
      });
    } finally {
      await f.close();
    }
  });

  it("runs enrolled work headlessly, coalesces concurrent triggers and persists the next due time", async () => {
    const f = await fintocAppFixture();
    const environment = testEnvironment({
      FINTOC_PUBLIC_KEY: "pk_test_fixture",
      FINTOC_SECRET_KEY: "sk_test_fixture",
      FINTOC_TOKEN_ENCRYPTION_KEY: "1".repeat(64),
      BANKING_AUTOMATIC_SYNC_ENABLED: true,
    });
    const module = await Test.createTestingModule({
      imports: [BankingSchedulingModule],
    })
      .overrideProvider(EnvironmentService)
      .useValue(environment)
      .overrideProvider(FINTOC_FETCH)
      .useValue(f.fetch)
      .overrideProvider(FintocRequestAdmission)
      .useValue(fintocAdmission())
      .overrideProvider(BankingSyncTimer)
      .useValue({})
      .compile();
    try {
      await module.init();
      const selection = await f.first.banking.accountSelection.query({
        id: f.connected.id,
      });
      await f.first.banking.selectAccounts.mutate({
        id: f.connected.id,
        expectedVersion: selection.version,
        discoveryVersion: selection.discoveryVersion,
        accountIds: selection.accountIds,
        automaticEnrolled: true,
      });
      f.fetch.mockClear();
      const runner = module.get(BankingSyncRunner);
      const outcomes = await Promise.all([runner.runOnce(), runner.runOnce()]);
      expect(
        outcomes.filter((outcome) => outcome?.status === "complete"),
      ).toHaveLength(1);
      const status = await f.syncStatus();
      expect(status).toMatchObject({
        activity: "idle",
        lastResult: "complete",
        automation: { enrolled: true, failureCount: 0, pauseReason: null },
      });
      expect(Date.parse(status.automation.nextAttemptAt ?? "")).toBeGreaterThan(
        Date.now() + 59 * 60_000,
      );
      expect(status.freshness.state).not.toBe("fresh");
      f.fetch.mockClear();
      await runner.runOnce();
      expect(f.fetch).not.toHaveBeenCalled();
      await f.first.banking.disconnect.mutate({ id: f.connected.id });
      expect((await f.syncStatus()).automation.pauseReason).toBe("access");
    } finally {
      await module.close();
      await f.close();
    }
  });

  it("sets, changes and clears aliases while preserving banking identity across sync/relink", async () => {
    const f = await fintocAppFixture();
    try {
      await f.run();
      const original = await fintocStoredAccount(f);
      expect(
        await f.first.accounts.setAlias.mutate({
          id: original.id,
          alias: "  Cuenta para vivir  ",
        }),
      ).toMatchObject({
        id: original.id,
        alias: "Cuenta para vivir",
        balance: original.balance,
      });
      await expect(
        f.other.accounts.setAlias.mutate({ id: original.id, alias: "Foreign" }),
      ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
      await expect(
        f.first.accounts.setAlias.mutate({ id: original.id, alias: "   " }),
      ).rejects.toMatchObject({ data: { code: "BAD_REQUEST" } });
      f.onRead.mockImplementationOnce(async () => {
        await f.first.accounts.setAlias.mutate({
          id: original.id,
          alias: "Mi cuenta principal",
        });
      });
      await f.refresh();
      await f.connect(f.connected.id);
      await f.refresh();
      expect(await fintocStoredAccount(f)).toMatchObject({
        id: original.id,
        external_id: original.external_id,
        alias: "Mi cuenta principal",
        balance: original.balance,
      });
      expect(
        await f.first.accounts.setAlias.mutate({
          id: original.id,
          alias: null,
        }),
      ).toMatchObject({ id: original.id, alias: null, type: "checking" });
    } finally {
      await f.close();
    }
  });

  it("requires explicit selection; discovery retains only metadata and cannot import finances", async () => {
    const f = await fintocAppFixture(undefined, false);
    try {
      await expect(f.run()).rejects.toMatchObject({
        data: { code: "CONFLICT" },
      });
      expect(f.fetch).not.toHaveBeenCalled();
      const found = await f.first.banking.discoverAccounts.mutate({
        id: f.connected.id,
      });
      expect(found.accountIds).toEqual([]);
      expect(found.confirmedAt).toBeNull();
      expect(JSON.stringify(found)).not.toMatch(
        /balance|holder_name|holder_id|link_token|credential/,
      );
      expect(
        await f.db.rows("account", { providerConnectionId: f.connected.id }),
      ).toEqual([]);
      for (const accountIds of [
        ["foreign_account"],
        ["acc_usd"],
        ["acc_line"],
      ]) {
        await expect(
          f.first.banking.selectAccounts.mutate({
            id: f.connected.id,
            expectedVersion: found.version,
            discoveryVersion: found.discoveryVersion,
            accountIds,
            automaticEnrolled: true,
          }),
        ).rejects.toMatchObject({ data: { code: "BAD_REQUEST" } });
      }
      await expect(
        f.other.banking.discoverAccounts.mutate({ id: f.connected.id }),
      ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
      await expect(
        f.other.banking.accountSelection.query({ id: f.connected.id }),
      ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
    } finally {
      await f.close();
    }
  });

  it("imports only the selected subset, leaves new accounts unselected and preserves history on deselection", async () => {
    const f = await fintocAppFixture(undefined, false);
    try {
      const found = await f.first.banking.discoverAccounts.mutate({
        id: f.connected.id,
      });
      const selected = await f.first.banking.selectAccounts.mutate({
        id: f.connected.id,
        expectedVersion: found.version,
        discoveryVersion: found.discoveryVersion,
        accountIds: ["acc_checking"],
        automaticEnrolled: true,
      });
      f.fetch.mockClear();
      expect(await f.run()).toMatchObject({
        status: "complete",
        report: { importedAccounts: 1 },
      });
      expect(
        f.fetch.mock.calls.map(([url]) => String(url)).join("\n"),
      ).not.toMatch(/acc_savings\/movements|acc_card\/movements/);
      expect(
        await f.db.rows("account", { providerConnectionId: f.connected.id }),
      ).toHaveLength(1);
      const original = await fintocStoredAccount(f);
      await f.first.banking.selectAccounts.mutate({
        id: f.connected.id,
        expectedVersion: selected.version,
        discoveryVersion: selected.discoveryVersion,
        accountIds: [],
        automaticEnrolled: true,
      });
      f.fetch.mockClear();
      await expect(f.refresh()).rejects.toMatchObject({
        data: { code: "CONFLICT" },
      });
      expect(f.fetch).not.toHaveBeenCalled();
      expect(await fintocStoredAccount(f)).toMatchObject({
        id: original.id,
        balance: original.balance,
        active: true,
      });
      expect(await f.syncStatus()).toMatchObject({
        canRefresh: false,
        automation: { selectedAccounts: 0, pauseReason: "no_accounts" },
      });
    } finally {
      await f.close();
    }
  });

  it("rejects obsolete discovery and supersedes deselection during fetch without writing financial facts", async () => {
    const f = await fintocAppFixture();
    try {
      const selected = await f.first.banking.accountSelection.query({
        id: f.connected.id,
      });
      f.onRead.mockImplementationOnce(async () => {
        await f.first.banking.selectAccounts.mutate({
          id: f.connected.id,
          expectedVersion: selected.version,
          discoveryVersion: selected.discoveryVersion,
          accountIds: [],
          automaticEnrolled: false,
        });
      });
      expect(await f.run()).toEqual({ status: "superseded" });
      expect(
        await f.db.rows("account", { providerConnectionId: f.connected.id }),
      ).toEqual([]);
      await f.connect(f.connected.id);
      await expect(
        f.first.banking.selectAccounts.mutate({
          id: f.connected.id,
          expectedVersion: selected.version + 1,
          discoveryVersion: selected.discoveryVersion,
          accountIds: ["acc_checking"],
          automaticEnrolled: false,
        }),
      ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
    } finally {
      await f.close();
    }
  });
});
