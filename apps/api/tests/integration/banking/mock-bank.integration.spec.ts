import { describe, expect, it } from "vitest";
import { PersistenceClient } from "../../../src/persistence/persistence.client";
import { testEnvironment } from "../../fixtures/environment";
import {
  type Fixture,
  fixture,
  integration,
  startApi,
} from "../../fixtures/persistence";

async function setup() {
  const f = await fixture();
  f.environment = testEnvironment({ DEMO_TOOLS_ENABLED: true });
  f.persistence = new PersistenceClient(f.environment);
  const server = await startApi(f);
  return { f, server, bank: server.client() };
}

async function close(f: Fixture, server: Awaited<ReturnType<typeof startApi>>) {
  await server.app.close();
  await f.db.close();
}

describe.skipIf(!integration)("prepared demo bank over signed RPC", () => {
  it("prepares from source, imports selected history, and carries new activity only after refresh", async () => {
    const { f, server, bank } = await setup();
    try {
      const prepared = await bank.demoTools.resetDemoData.mutate();
      expect(prepared).toMatchObject({ status: "ready" });
      const owned = await f.persistence
        .user(f.userId)
        .providerLinks.list.query();
      expect(owned).toEqual([
        expect.objectContaining({
          id: prepared.connectionId,
          provider: "mock_bank",
        }),
      ]);
      const selection = await bank.banking.accountSelection.query({
        id: prepared.connectionId,
      });
      expect(selection.accounts).toHaveLength(6);
      expect(selection.accountIds).toHaveLength(3);
      expect(selection.automaticEnrolled).toBe(false);
      const accounts = await f.db.rows("account", {
        providerConnectionId: prepared.connectionId,
      });
      expect(accounts).toHaveLength(3);
      expect(
        accounts.every((row) => row.history_completeness === "complete"),
      ).toBe(true);
      const financial = await f.db.pool.query<{
        count: string;
        manual: string;
        confirmed: string;
      }>(
        `SELECT count(*)::text as count, count(*) FILTER (WHERE m.tag_decision_origin = 'manual')::text as manual,
          (SELECT count(*)::text FROM finance.income_receipt r JOIN finance."transaction" t ON t.id=r.transaction_id JOIN finance.account a ON a.id=t.account_id WHERE a.provider_connection_id=$1) as confirmed
         FROM finance."transaction" m JOIN finance.account a ON a.id=m.account_id WHERE a.provider_connection_id=$1`,
        [prepared.connectionId],
      );
      expect(financial.rows[0].count).toBe(String(prepared.transactionCount));
      expect(Number(financial.rows[0].manual)).toBeGreaterThan(100);
      expect(Number(financial.rows[0].confirmed)).toBeGreaterThan(0);
      const history = await bank.banking.syncHistory.query({
        id: prepared.connectionId,
      });
      expect(history.some((event) => event.origin === "generated")).toBe(true);
      expect(
        history.some(
          (event) => event.origin === "executed" && event.result === "complete",
        ),
      ).toBe(true);
      const before = await f.db.rows("transaction", {
        accountId: accounts[0].id,
      });
      await bank.demoTools.createInternalTransaction.mutate();
      const changedSource = await f.persistence
        .user(f.userId)
        .demoTools.bankSource.query({ id: prepared.connectionId });
      expect(changedSource.movements).toHaveLength(
        prepared.transactionCount * 2 + 2,
      );
      expect(await bank.demoTools.preparation.query()).toMatchObject({
        prepared: true,
        transactionCount: prepared.transactionCount,
      });
      expect(await bank.demoTools.resumeDemoData.mutate()).toEqual(prepared);
      expect(
        await f.db.rows("transaction", { accountId: accounts[0].id }),
      ).toHaveLength(before.length);
      expect(
        (await bank.banking.refresh.mutate({ id: prepared.connectionId }))
          .status,
      ).toBe("complete");
      const after = await f.db.pool.query<{ count: string }>(
        `SELECT count(*)::text as count FROM finance."transaction" m JOIN finance.account a ON a.id=m.account_id WHERE a.provider_connection_id=$1`,
        [prepared.connectionId],
      );
      expect(after.rows[0].count).toBe(String(prepared.transactionCount + 2));
      const corrected = await bank.demoTools.changeBankMovement.mutate({
        action: "correct",
      });
      expect(corrected.description).toContain("Compra corregida");
      const correctedSource = await f.persistence
        .user(f.userId)
        .demoTools.bankSource.query({ id: prepared.connectionId });
      const changed = correctedSource.movements.findLast(
        (movement) =>
          movement.description &&
          corrected.description.includes(movement.description) &&
          movement.accountExternalId.startsWith("demo-main-") &&
          Number(movement.amount) < 0 &&
          !movement.relatedMovement,
      );
      expect(changed).toBeDefined();
      if (!changed)
        throw new Error("Corrected movement not found in the demo source");
      const oldAmount = await f.db.pool.query<{
        amount: string;
        id: string;
        tag_decision_origin: string;
      }>(
        `SELECT m.id,m.amount::text,m.tag_decision_origin FROM finance."transaction" m
         JOIN finance.account a ON a.id=m.account_id WHERE a.provider_connection_id=$1 AND m.external_id=$2`,
        [prepared.connectionId, changed.externalId],
      );
      expect(Number(oldAmount.rows[0].amount)).not.toBe(Number(changed.amount));
      expect(
        (await bank.banking.refresh.mutate({ id: prepared.connectionId }))
          .status,
      ).toBe("complete");
      const actual = await f.db.rows("transaction", {
        id: oldAmount.rows[0].id,
      });
      expect(actual[0].amount).toBe(changed.amount);
      expect(actual[0].tag_decision_origin).toBe(
        oldAmount.rows[0].tag_decision_origin,
      );
      await bank.demoTools.changeBankMovement.mutate({ action: "remove" });
      expect(
        (await f.db.rows("transaction", { id: oldAmount.rows[0].id }))[0]
          .removed_at,
      ).toBeNull();
      expect(
        (await bank.banking.refresh.mutate({ id: prepared.connectionId }))
          .status,
      ).toBe("complete");
      expect(
        (await f.db.rows("transaction", { id: oldAmount.rows[0].id }))[0],
      ).toMatchObject({
        removal_reason: "removed",
        tag_decision_origin: oldAmount.rows[0].tag_decision_origin,
      });
      const chosen = await bank.banking.accountSelection.query({
        id: prepared.connectionId,
      });
      await expect(
        bank.banking.selectAccounts.mutate({
          id: prepared.connectionId,
          expectedVersion: chosen.version,
          discoveryVersion: chosen.discoveryVersion,
          accountIds: chosen.accountIds,
          automaticEnrolled: true,
        }),
      ).rejects.toMatchObject({ data: { code: "BAD_REQUEST" } });
      const added = await bank.banking.selectAccounts.mutate({
        id: prepared.connectionId,
        expectedVersion: chosen.version,
        discoveryVersion: chosen.discoveryVersion,
        accountIds: [...chosen.accountIds, "demo-extra-checking"],
        automaticEnrolled: false,
      });
      expect(added.accountIds).toHaveLength(4);
      expect(
        await f.db.rows("account", {
          providerConnectionId: prepared.connectionId,
        }),
      ).toHaveLength(3);
      expect(
        (await bank.banking.refresh.mutate({ id: prepared.connectionId }))
          .status,
      ).toBe("complete");
      expect(
        await f.db.rows("account", {
          providerConnectionId: prepared.connectionId,
        }),
      ).toHaveLength(4);
      const additional = await f.db.pool.query<{ movements: string }>(
        `SELECT count(*)::text AS movements FROM finance."transaction" m
         JOIN finance.account a ON a.id=m.account_id
         WHERE a.provider_connection_id=$1 AND a.external_id='demo-extra-checking'`,
        [prepared.connectionId],
      );
      expect(Number(additional.rows[0].movements)).toBeGreaterThan(0);
      expect(
        (
          await f.db.rows("provider_sync_schedule", {
            connectionId: prepared.connectionId,
          })
        )[0].eligible,
      ).toBe(false);
      await expect(
        server
          .client(f.otherToken)
          .banking.syncHistory.query({ id: prepared.connectionId }),
      ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
    } finally {
      await close(f, server);
    }
  }, 45000);

  it("continues an incomplete preparation after the simulated source is restored without another reset", async () => {
    const { f, server, bank } = await setup();
    try {
      const initial = await f.persistence
        .user(f.userId)
        .demoTools.resetDemoData.mutate();
      expect(initial.status).toBe("incomplete");
      await bank.demoTools.setBankFailure.mutate({ failure: "retryable" });
      expect(await bank.demoTools.resumeDemoData.mutate()).toEqual(initial);
      expect(
        await f.db.rows("account", {
          providerConnectionId: initial.connectionId,
        }),
      ).toHaveLength(0);
      await bank.demoTools.setBankFailure.mutate({ failure: null });
      expect(await bank.demoTools.resumeDemoData.mutate()).toEqual({
        ...initial,
        status: "ready",
      });
      expect(await bank.demoTools.resumeDemoData.mutate()).toEqual({
        ...initial,
        status: "ready",
      });
      expect(await bank.demoTools.preparation.query()).toMatchObject({
        prepared: true,
        transactionCount: initial.transactionCount,
      });
      expect(
        await f.db.rows("account", {
          providerConnectionId: initial.connectionId,
        }),
      ).toHaveLength(3);
    } finally {
      await close(f, server);
    }
  }, 45000);

  it("keeps failed attempts distinct from generated history and requires explicit relinking", async () => {
    const { f, server, bank } = await setup();
    try {
      const prepared = await bank.demoTools.resetDemoData.mutate();
      expect(prepared.status).toBe("ready");
      const original = await f.db.rows("account", {
        providerConnectionId: prepared.connectionId,
      });
      const balances = (rows: typeof original) =>
        Object.fromEntries(rows.map((row) => [row.id, row.balance]));
      await bank.demoTools.setBankFailure.mutate({ failure: "retryable" });
      expect(
        await bank.banking.refresh.mutate({ id: prepared.connectionId }),
      ).toMatchObject({ status: "failed", reason: "retryable" });
      const history = await bank.banking.syncHistory.query({
        id: prepared.connectionId,
      });
      expect(
        history.some(
          (event) =>
            event.origin === "executed" &&
            event.result === "failed" &&
            event.failureReason === "retryable",
        ),
      ).toBe(true);
      await bank.demoTools.setBankFailure.mutate({ failure: null });
      expect(
        (await bank.banking.refresh.mutate({ id: prepared.connectionId }))
          .status,
      ).toBe("retry_later");
      expect(
        balances(
          await f.db.rows("account", {
            providerConnectionId: prepared.connectionId,
          }),
        ),
      ).toEqual(balances(original));
      await f.db.pool.query(
        `UPDATE finance.provider_sync_state SET retry_after=null WHERE provider_connection_id=$1`,
        [prepared.connectionId],
      );
      await f.db.pool.query(
        `UPDATE finance.provider_sync_schedule SET next_attempt_at=now() WHERE connection_id=$1`,
        [prepared.connectionId],
      );
      await bank.demoTools.setBankFailure.mutate({ failure: "expired" });
      expect(
        await bank.banking.refresh.mutate({ id: prepared.connectionId }),
      ).toMatchObject({ status: "failed", reason: "expired" });
      expect(
        (await bank.banking.connections.query()).find(
          (row) => row.id === prepared.connectionId,
        )?.status,
      ).toBe("expired");
      await bank.demoTools.setBankFailure.mutate({ failure: null });
      expect(
        (
          await bank.banking.checkConnection.mutate({
            id: prepared.connectionId,
          })
        ).status,
      ).toBe("expired");
      await expect(
        bank.banking.refresh.mutate({ id: prepared.connectionId }),
      ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
      expect(
        await bank.banking.reconnectMock.mutate({ id: prepared.connectionId }),
      ).toEqual({ status: "active" });
      const unconfirmed = await bank.banking.accountSelection.query({
        id: prepared.connectionId,
      });
      expect(unconfirmed.confirmedAt).toBeNull();
      expect(unconfirmed.discoveryVersion).toBe(0);
      const discovered = await bank.banking.discoverAccounts.mutate({
        id: prepared.connectionId,
      });
      await bank.banking.selectAccounts.mutate({
        id: prepared.connectionId,
        expectedVersion: discovered.version,
        discoveryVersion: discovered.discoveryVersion,
        accountIds: unconfirmed.accountIds,
        automaticEnrolled: false,
      });
      expect(
        (await bank.banking.refresh.mutate({ id: prepared.connectionId }))
          .status,
      ).toBe("complete");
      expect(
        balances(
          await f.db.rows("account", {
            providerConnectionId: prepared.connectionId,
          }),
        ),
      ).toEqual(balances(original));
    } finally {
      await close(f, server);
    }
  }, 45000);
});
