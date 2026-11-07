import { describe, expect, it, vi } from "vitest";
import type { BankingConnector } from "../../../src/banking/connector/banking-connector";
import type {
  ConnectorPage,
  ConnectorResult,
} from "../../../src/banking/connector/normalized-banking.schema";
import { BankingIngestionService } from "../../../src/banking/ingestion/banking-ingestion.service";
import { IncomeService } from "../../../src/income/income.service";
import { SummariesService } from "../../../src/summaries/summaries.service";
import {
  correctionPage,
  expiredFailure,
  initialPage,
  removalPage,
  retryableFailure,
  unknownBalancePage,
} from "../../fixtures/banking/normalized-pages";
import { type Fixture, fixture, integration } from "../../fixtures/persistence";

const connector = (result: ConnectorResult): BankingConnector => ({
  provider: "fixture-bank",
  fetchPage: vi.fn(async () => result),
});

async function withConnection(
  work: (
    f: Fixture & {
      ingestion: BankingIngestionService;
      summaries: SummariesService;
    },
  ) => Promise<void>,
) {
  const f = await fixture();

  try {
    await work({
      ...f,
      ingestion: new BankingIngestionService(f.persistence),
      summaries: new SummariesService(
        f.persistence,
        new IncomeService(f.persistence),
      ),
    });
  } finally {
    await f.db.close();
  }
}

async function account(f: Fixture, external = "checking-1") {
  return (
    await f.db.rows("account", {
      providerConnectionId: f.connectionId,
      externalId: external,
    })
  )[0];
}

async function movement(
  f: Fixture,
  external: string,
  accountExternal = "checking-1",
) {
  return (
    await f.db.rows("transaction", {
      accountId: (await account(f, accountExternal)).id,
      externalId: external,
    })
  )[0];
}

async function confirmSalary(f: Fixture) {
  const salary = await movement(f, "salary-1");
  await f.db.update("transaction", salary.id, {
    isInternalMovement: false,
    userInternalOverride: false,
  });
  const income = new IncomeService(f.persistence);
  const source = await income.createSourceForUser(f.userId, {
    name: "Salary",
    regularity: "irregular",
    amountKind: "variable",
    startDate: "2026-01-01",
  });
  await income.confirmReceiptForUser(f.userId, salary.id, {
    sourceId: source.id,
  });

  return { salary, source, income };
}

describe.skipIf(!integration)(
  "API provider orchestration → real signed persistence RPC → PostgreSQL",
  () => {
    it("imports/replays facts, preserves manual choices and account aliases, and rejects older snapshots", async () => {
      await withConnection(async (f) => {
        expect(
          await f.ingestion.syncForUser(
            f.userId,
            f.connectionId,
            connector(initialPage),
          ),
        ).toEqual({
          status: "complete",
          conflictCount: 0,
          checkpoint: "through-2026-10-15",
        });
        const accounts = await f.persistence
          .user(f.userId)
          .accounts.listActive.query();
        expect(new Map(accounts.map((row) => [row.type, row.balance]))).toEqual(
          new Map([
            ["checking", "1160.00"],
            ["savings", "300.00"],
            ["credit_card", "-40.00"],
          ]),
        );
        expect(await account(f)).toMatchObject({
          history_completeness: "partial",
          history_from: "2026-10-01",
        });
        const grocery = await movement(f, "grocery-1");
        expect(await movement(f, "salary-1")).toMatchObject({
          booked_on: "2026-10-10",
          booked_at: new Date("2026-10-10T15:00:00Z"),
          is_internal_movement: null,
        });
        expect(
          await f.summaries.getMonthlyForUser(f.userId, "2026-10"),
        ).toMatchObject({
          spending: "200.00",
          receivedIncome: "0.00",
          unclassifiedCredits: { amount: "20.00" },
          unresolvedMovementCount: 1,
        });
        const tag = await f.persistence
          .user(f.userId)
          .tags.create.mutate({ name: "Personal" });
        await f.persistence
          .user(f.userId)
          .tagRules.manual.mutate({ transactionId: grocery.id, tagId: tag.id });
        await f.db.update("account", (await account(f)).id, {
          alias: "Mi cuenta",
        });
        await confirmSalary(f);
        expect(
          (
            await f.ingestion.syncForUser(
              f.userId,
              f.connectionId,
              connector(initialPage),
            )
          ).status,
        ).toBe("complete");
        expect(
          (
            await f.ingestion.syncForUser(
              f.userId,
              f.connectionId,
              connector(correctionPage),
            )
          ).status,
        ).toBe("complete");
        expect(await movement(f, "grocery-1")).toMatchObject({
          amount: "-120.00",
          description: "Corrected groceries",
          tag_id: tag.id,
        });
        expect(await account(f)).toMatchObject({
          alias: "Mi cuenta",
          balance: "1140.00",
        });
        expect(
          await f.db.rows("transaction", {
            accountId: grocery.account_id,
            externalId: "grocery-1",
          }),
        ).toHaveLength(1);
        expect(
          await f.summaries.getMonthlyForUser(f.userId, "2026-10"),
        ).toMatchObject({
          spending: "220.00",
          receivedIncome: "500.00",
          unresolvedMovementCount: 0,
        });
        expect(
          await f.ingestion.syncForUser(
            f.userId,
            f.connectionId,
            connector(initialPage),
          ),
        ).toMatchObject({ status: "failed", reason: "invalid_data" });
        expect(await movement(f, "grocery-1")).toMatchObject({
          amount: "-120.00",
        });
        const before = (
          await f.db.rows("provider_sync_state", {
            providerConnectionId: f.connectionId,
          })
        )[0];
        expect(
          await f.ingestion.syncForUser(
            f.userId,
            f.connectionId,
            connector(retryableFailure),
          ),
        ).toMatchObject({ status: "failed", reason: "retryable" });
        expect(
          (
            await f.db.rows("provider_sync_state", {
              providerConnectionId: f.connectionId,
            })
          )[0],
        ).toMatchObject({
          checkpoint: before.checkpoint,
          last_success_at: before.last_success_at,
        });
      });
    });
    it("applies conflicting corrections, preserves receipts/manual tags and suspends financial interpretation", async () => {
      await withConnection(async (f) => {
        await f.ingestion.syncForUser(
          f.userId,
          f.connectionId,
          connector(initialPage),
        );
        const { salary, source, income } = await confirmSalary(f);
        const tag = await f.persistence
          .user(f.userId)
          .tags.create.mutate({ name: "Income" });
        await f.persistence
          .user(f.userId)
          .tagRules.manual.mutate({ transactionId: salary.id, tagId: tag.id });
        const flip: ConnectorPage = {
          ...initialPage,
          observedAt: "2026-10-18T18:00:00.000Z",
          checkpoint: "sign-flip",
          accounts: [],
          movements: [{ ...initialPage.movements[0], amount: "-500.00" }],
        };
        expect(
          await f.ingestion.syncForUser(
            f.userId,
            f.connectionId,
            connector(flip),
          ),
        ).toEqual({
          status: "needs_review",
          conflictCount: 1,
          checkpoint: "sign-flip",
        });
        expect(await movement(f, "salary-1")).toMatchObject({
          amount: "-500.00",
          type: "debit",
          tag_id: tag.id,
          review_status: "needs_review",
        });
        expect(
          await f.summaries.getMonthlyForUser(f.userId, "2026-10"),
        ).toMatchObject({
          receivedIncome: "0.00",
          spending: "200.00",
          unresolvedMovementCount: 1,
        });
        expect(await income.listReceiptsForUser(f.userId, "2026-10")).toEqual(
          [],
        );
        expect(
          await f.db.rows("income_receipt", { transactionId: salary.id }),
        ).toHaveLength(1);
        expect(
          await f.ingestion.listPendingReviewForUser(f.otherUserId),
        ).toEqual([]);
        expect(
          await f.ingestion.listPendingReviewForUser(f.userId),
        ).toMatchObject([
          {
            transactionId: salary.id,
            tagId: tag.id,
            incomeSourceId: source.id,
            reason: "receipt_incompatible",
          },
        ]);
        expect(
          await f.ingestion.syncForUser(
            f.userId,
            f.connectionId,
            connector(flip),
          ),
        ).toMatchObject({ conflictCount: 1 });
      });
    });
    it("retains confirmed income on compatible amount/date corrections", async () => {
      await withConnection(async (f) => {
        await f.ingestion.syncForUser(
          f.userId,
          f.connectionId,
          connector(initialPage),
        );
        const { salary, source } = await confirmSalary(f);
        const correction: ConnectorPage = {
          ...initialPage,
          observedAt: "2026-10-17T18:00:00.000Z",
          checkpoint: "salary-corrected",
          accounts: [],
          movements: [
            {
              ...initialPage.movements[0],
              amount: "480.00",
              booked: {
                precision: "calendar_day",
                on: "2026-10-11",
                timeZone: "America/Santiago",
              },
            },
          ],
        };
        expect(
          await f.ingestion.syncForUser(
            f.userId,
            f.connectionId,
            connector(correction),
          ),
        ).toMatchObject({ status: "complete", conflictCount: 0 });
        expect(await movement(f, "salary-1")).toMatchObject({
          amount: "480.00",
          booked_on: "2026-10-11",
          review_status: "clear",
        });
        expect(
          await f.summaries.getMonthlyForUser(f.userId, "2026-10"),
        ).toMatchObject({ receivedIncome: "480.00" });
        expect(
          (await f.db.rows("income_receipt", { transactionId: salary.id }))[0]
            .source_id,
        ).toBe(source.id);
      });
    });
    it("retains tombstones through replay and through removals that precede first account import", async () => {
      await withConnection(async (f) => {
        await f.ingestion.syncForUser(
          f.userId,
          f.connectionId,
          connector(initialPage),
        );
        await f.ingestion.syncForUser(
          f.userId,
          f.connectionId,
          connector(removalPage),
        );
        await f.ingestion.syncForUser(
          f.userId,
          f.connectionId,
          connector({ ...initialPage, observedAt: "2026-10-20T18:00:00.000Z" }),
        );
        expect(await movement(f, "grocery-1")).toMatchObject({
          removal_reason: "reversed",
          amount: "-100.00",
        });
        expect(
          await f.summaries.getMonthlyForUser(f.userId, "2026-10"),
        ).toMatchObject({ spending: "100.00" });
        await f.ingestion.syncForUser(
          f.userId,
          f.connectionId,
          connector({
            ...initialPage,
            observedAt: "2026-10-21T18:00:00.000Z",
            accounts: [],
            movements: [],
            removedMovements: [
              {
                accountExternalId: "later",
                externalId: "withdrawn",
                reason: "removed",
                providerUpdatedAt: null,
              },
            ],
          }),
        );
        await f.ingestion.syncForUser(
          f.userId,
          f.connectionId,
          connector({
            ...initialPage,
            observedAt: "2026-10-22T18:00:00.000Z",
            accounts: [{ ...initialPage.accounts[0], externalId: "later" }],
            movements: [
              {
                ...initialPage.movements[1],
                accountExternalId: "later",
                externalId: "withdrawn",
              },
            ],
          }),
        );
        expect(
          await f.db.rows("transaction", {
            accountId: (await account(f, "later")).id,
          }),
        ).toEqual([]);
      });
    });
    it("does not apply partial pages, authorizes before fetching, and records expiry without changing last-good facts", async () => {
      await withConnection(async (f) => {
        const fetchPage = vi.fn(async ({ pageCursor }) =>
          pageCursor === null
            ? {
                ...initialPage,
                complete: false,
                nextCursor: "page-2",
                checkpoint: null,
              }
            : retryableFailure,
        );
        expect(
          await f.ingestion.syncForUser(f.userId, f.connectionId, {
            provider: "fixture-bank",
            fetchPage,
          }),
        ).toMatchObject({ status: "failed", reason: "retryable" });
        expect(fetchPage).toHaveBeenCalledTimes(2);
        expect(
          await f.db.rows("account", { providerConnectionId: f.connectionId }),
        ).toEqual([]);
        const unauthorized = vi.fn(async () => initialPage);
        await expect(
          f.ingestion.syncForUser(f.otherUserId, f.connectionId, {
            provider: "fixture-bank",
            fetchPage: unauthorized,
          }),
        ).rejects.toThrow("Banking connection not found");
        expect(unauthorized).not.toHaveBeenCalled();
        await f.ingestion.syncForUser(
          f.userId,
          f.connectionId,
          connector(unknownBalancePage),
        );
        expect(await account(f)).toMatchObject({
          balance: null,
          history_completeness: "unknown",
        });
        expect(
          await f.ingestion.syncForUser(
            f.userId,
            f.connectionId,
            connector(expiredFailure),
          ),
        ).toMatchObject({ status: "failed", reason: "expired" });
        expect(
          (await f.db.rows("provider_connection", { id: f.connectionId }))[0]
            .status,
        ).toBe("expired");
      });
    });
    it("verifies all pages and scopes reused external IDs independently to connections/users", async () => {
      await withConnection(async (f) => {
        const fetchPage = vi.fn(async ({ checkpoint, pageCursor }) => {
          expect(checkpoint).toBeNull();
          return pageCursor === null
            ? {
                ...initialPage,
                complete: false,
                nextCursor: "second",
                checkpoint: null,
                accounts: initialPage.accounts.slice(0, 1),
                movements: initialPage.movements.slice(0, 3),
              }
            : {
                ...initialPage,
                accounts: initialPage.accounts.slice(1),
                movements: initialPage.movements.slice(3),
              };
        });
        expect(
          (
            await f.ingestion.syncForUser(f.userId, f.connectionId, {
              provider: "fixture-bank",
              fetchPage,
            })
          ).status,
        ).toBe("complete");
        expect(
          (
            await f.ingestion.syncForUser(
              f.otherUserId,
              f.otherConnectionId,
              connector(initialPage),
            )
          ).status,
        ).toBe("complete");
        expect(
          await f.persistence.user(f.userId).accounts.listActive.query(),
        ).toHaveLength(3);
        expect(
          await f.persistence.user(f.otherUserId).accounts.listActive.query(),
        ).toHaveLength(3);
      });
    });
    it("treats paired-transfer evidence as a conflict but a merchant hint cannot override a manual internal choice", async () => {
      await withConnection(async (f) => {
        await f.ingestion.syncForUser(
          f.userId,
          f.connectionId,
          connector(initialPage),
        );
        const transfer = await movement(f, "transfer-leg"),
          grocery = await movement(f, "grocery-1");
        await f.db.update("transaction", transfer.id, {
          userInternalOverride: false,
          isInternalMovement: false,
        });
        await f.db.update("transaction", grocery.id, {
          userInternalOverride: true,
          isInternalMovement: true,
        });
        expect(
          await f.ingestion.syncForUser(
            f.userId,
            f.connectionId,
            connector(initialPage),
          ),
        ).toMatchObject({ status: "needs_review", conflictCount: 1 });
        expect(await movement(f, "grocery-1")).toMatchObject({
          user_internal_override: true,
          review_status: "clear",
        });
        expect(
          await f.ingestion.listPendingReviewForUser(f.userId),
        ).toMatchObject([
          { transactionId: transfer.id, reason: "internal_override_disagrees" },
        ]);
        expect(
          await f.summaries.getMonthlyForUser(f.userId, "2026-10"),
        ).toMatchObject({ spending: "100.00", unresolvedMovementCount: 2 });
      });
    });
    it("retains a receipt on removal but suspends its active interpretation", async () => {
      await withConnection(async (f) => {
        await f.ingestion.syncForUser(
          f.userId,
          f.connectionId,
          connector(initialPage),
        );
        const { salary, income } = await confirmSalary(f);
        expect(
          await f.ingestion.syncForUser(
            f.userId,
            f.connectionId,
            connector({
              ...removalPage,
              removedMovements: [
                { ...removalPage.removedMovements[0], externalId: "salary-1" },
              ],
            }),
          ),
        ).toMatchObject({ status: "needs_review", conflictCount: 1 });
        expect(
          await f.db.rows("income_receipt", { transactionId: salary.id }),
        ).toHaveLength(1);
        expect(await income.listReceiptsForUser(f.userId, "2026-10")).toEqual(
          [],
        );
      });
    });
    it("supersedes concurrent runs without overwriting their checkpoint or recording a stale failure", async () => {
      await withConnection(async (f) => {
        const fetchPage = vi.fn(async () => {
          await f.db.update(
            "provider_sync_state",
            f.connectionId,
            { checkpoint: "newer-run", revision: 1 },
            "providerConnectionId",
          );
          return initialPage;
        });
        expect(
          await f.ingestion.syncForUser(f.userId, f.connectionId, {
            provider: "fixture-bank",
            fetchPage,
          }),
        ).toEqual({ status: "superseded" });
        expect(
          await f.db.rows("account", { providerConnectionId: f.connectionId }),
        ).toEqual([]);
        expect(
          (
            await f.db.rows("provider_sync_state", {
              providerConnectionId: f.connectionId,
            })
          )[0],
        ).toMatchObject({ checkpoint: "newer-run", last_failure_reason: null });
      });
    });
    it("writes no account snapshots when any movement in the prepared batch is invalid", async () => {
      await withConnection(async (f) => {
        expect(
          await f.ingestion.syncForUser(
            f.userId,
            f.connectionId,
            connector({
              ...initialPage,
              movements: [
                { ...initialPage.movements[1], accountExternalId: "unknown" },
              ],
            }),
          ),
        ).toMatchObject({ status: "failed", reason: "invalid_data" });
        expect(
          await f.db.rows("account", { providerConnectionId: f.connectionId }),
        ).toEqual([]);
        expect(
          (
            await f.db.rows("provider_sync_state", {
              providerConnectionId: f.connectionId,
            })
          )[0],
        ).toMatchObject({
          checkpoint: null,
          revision: 0,
          last_failure_reason: "invalid_data",
        });
      });
    });
    it("retains a previously verified internal pair on a one-leg replay", async () => {
      await withConnection(async (f) => {
        await f.ingestion.syncForUser(
          f.userId,
          f.connectionId,
          connector(initialPage),
        );
        await f.ingestion.syncForUser(
          f.userId,
          f.connectionId,
          connector({
            ...initialPage,
            observedAt: "2026-10-17T18:00:00.000Z",
            accounts: [],
            movements: [initialPage.movements[2]],
          }),
        );
        expect(await movement(f, "transfer-leg")).toMatchObject({
          is_internal_movement: true,
          provider_internal_assessment: "internal",
        });
        expect(
          await f.summaries.getMonthlyForUser(f.userId, "2026-10"),
        ).toMatchObject({ spending: "200.00" });
      });
    });
  },
);
