import { randomUUID } from "node:crypto";
import type { IncomeSourceInput } from "@lazyfinance/contracts";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { IncomeService } from "../../../src/income/income.service";
import { SummariesService } from "../../../src/summaries/summaries.service";
import {
  type Fixture,
  fixture,
  integration,
  startApi,
} from "../../fixtures/persistence";

function sourceInput(
  changes: Partial<IncomeSourceInput> = {},
): IncomeSourceInput {
  return {
    name: "Trabajo principal",
    currency: "CLP",
    regularity: "regular",
    amountKind: "fixed",
    expectedAmount: "1500000.00",
    schedule: { frequency: "monthly", day: 25 },
    startDate: "2026-01-01",
    endDate: null,
    ...changes,
  };
}

async function withApi(
  work: (
    f: Fixture &
      Awaited<ReturnType<typeof startApi>> & {
        salaryId: string;
        internalId: string;
        debitId: string;
        futureId: string;
        otherTransactionId: string;
      },
  ) => Promise<void>,
  mcp = false,
) {
  const f = await fixture(true);
  const salaryId = randomUUID(),
    internalId = randomUUID(),
    debitId = randomUUID(),
    futureId = randomUUID(),
    otherTransactionId = randomUUID();

  for (const [id, amount, date, internal, account] of [
    [salaryId, "1480000.00", "2026-09-26", false, f.accountId],
    [randomUUID(), "20000.00", "2026-09-27", false, f.accountId],
    [internalId, "50000.00", "2026-09-28", true, f.accountId],
    [debitId, "-100000.00", "2026-09-20", false, f.accountId],
    [futureId, "300000.00", "2099-01-01", false, f.accountId],
    [otherTransactionId, "999000.00", "2026-09-26", false, f.otherAccountId],
  ] as const)
    await f.db.insert("transaction", {
      id,
      accountId: account,
      amount,
      type: amount.startsWith("-") ? "debit" : "credit",
      bookedAt: new Date(`${date}T15:00:00Z`),
      isInternalMovement: internal,
    });

  const api = await startApi(f, mcp);

  try {
    await work({
      ...f,
      ...api,
      salaryId,
      internalId,
      debitId,
      futureId,
      otherTransactionId,
    });
  } finally {
    await api.app.close();
    await f.db.close();
  }
}

describe.skipIf(!integration)(
  "Income API → atomic private commands and factual snapshots",
  () => {
    it("validates declarations, updates/archives idempotently, and never modifies bank facts", async () => {
      await withApi(async (f) => {
        const api = f.client();
        await expect(
          api.income.createSource.mutate(sourceInput({ schedule: null })),
        ).rejects.toMatchObject({ data: { code: "BAD_REQUEST" } });
        const before = await f.db.rows("transaction", {
          accountId: f.accountId,
        });
        const source = await api.income.createSource.mutate(sourceInput());
        expect(source).not.toHaveProperty("userId");
        expect(
          (await api.income.expected.query({ month: "2026-09" })).totals,
        ).toMatchObject({ amount: "1500000.00", paymentCount: 1 });
        expect(
          (await api.income.summary.query({ month: "2026-09" }))
            .unclassifiedCredits,
        ).toEqual({ amount: "1500000.00", count: 2 });
        await api.income.confirm.mutate({
          transactionId: f.salaryId,
          sourceId: source.id,
        });
        await api.income.updateSource.mutate({
          id: source.id,
          source: sourceInput({
            amountKind: "variable",
            expectedAmount: "1700000.00",
          }),
        });
        const updated = await api.income.summary.query({ month: "2026-09" });
        expect(updated.expectedIncome).toMatchObject({
          amount: "1700000.00",
          estimatedAmount: "1700000.00",
        });
        expect(updated.receivedIncome).toBe("1480000.00");
        expect(updated.receipts[0]).toMatchObject({
          transactionId: f.salaryId,
          amount: "1480000.00",
          bookedAt: "2026-09-26T15:00:00.000Z",
        });
        expect(updated.expectedPayments[0].date).toBe("2026-09-25");
        expect(
          await f.db.rows("transaction", { accountId: f.accountId }),
        ).toEqual(before);
        expect(
          (await f.db.rows("account", { id: f.accountId }))[0].balance,
        ).toBe("500000.00");
        const archived = await api.income.archiveSource.mutate({
          id: source.id,
        });
        expect(archived.archivedAt).not.toBeNull();
        expect(
          (await api.income.archiveSource.mutate({ id: source.id })).archivedAt,
        ).toBe(archived.archivedAt);
        await expect(
          api.income.updateSource.mutate({
            id: source.id,
            source: sourceInput(),
          }),
        ).rejects.toMatchObject({ data: { code: "BAD_REQUEST" } });
        expect(
          (await api.income.summary.query({ month: "2099-02" })).expectedIncome
            .paymentCount,
        ).toBe(0);
        expect(
          await api.income.receipts.query({ month: "2026-09" }),
        ).toHaveLength(1);
      });
    });
    it("supports explicit irregular expectations and unknown regular amounts without projecting irregular income", async () => {
      await withApi(async (f) => {
        const api = f.client();
        const source = await api.income.createSource.mutate(
          sourceInput({
            regularity: "irregular",
            amountKind: "variable",
            expectedAmount: null,
            schedule: null,
          }),
        );
        expect(
          (await api.income.expected.query({ month: "2026-09" })).payments,
        ).toEqual([]);
        await expect(
          api.income.createExpectation.mutate({
            sourceId: source.id,
            expectation: { date: "2025-12-01", amount: "100.00" },
          }),
        ).rejects.toMatchObject({ data: { code: "BAD_REQUEST" } });
        const expectation = await api.income.createExpectation.mutate({
          sourceId: source.id,
          expectation: {
            date: "2026-09-20",
            amount: "250000.00",
            isEstimate: true,
          },
        });
        await api.income.updateExpectation.mutate({
          id: expectation.id,
          expectation: {
            date: "2026-09-21",
            amount: "270000.00",
            isEstimate: false,
          },
        });
        const expected = await api.income.expected.query({ month: "2026-09" });
        expect(expected.totals).toEqual({
          amount: "270000.00",
          estimatedAmount: "0.00",
          paymentCount: 1,
          unknownAmountCount: 0,
        });
        expect(expected.payments[0]).toMatchObject({
          date: "2026-09-21",
          expectationId: expectation.id,
        });
        await expect(
          api.income.updateSource.mutate({
            id: source.id,
            source: sourceInput(),
          }),
        ).rejects.toMatchObject({ data: { code: "BAD_REQUEST" } });
        await api.income.removeExpectation.mutate({ id: expectation.id });
        await api.income.updateSource.mutate({
          id: source.id,
          source: sourceInput({ amountKind: "variable", expectedAmount: null }),
        });
        expect(
          (await api.income.expected.query({ month: "2026-09" })).totals,
        ).toMatchObject({
          amount: "0.00",
          paymentCount: 1,
          unknownAmountCount: 1,
        });
        await expect(
          api.income.createExpectation.mutate({
            sourceId: source.id,
            expectation: { date: "2026-09-21", amount: "1.00" },
          }),
        ).rejects.toMatchObject({ data: { code: "BAD_REQUEST" } });
        await expect(
          api.income.expected.query({ month: "2026-13" }),
        ).rejects.toMatchObject({ data: { code: "BAD_REQUEST" } });
      });
    });
    it("counts confirmed receipts once, excludes refunds/transfers/future credits and agrees through tRPC/MCP", async () => {
      await withApi(async (f) => {
        const api = f.client(),
          source = await api.income.createSource.mutate(sourceInput());
        const first = await api.income.confirm.mutate({
          transactionId: f.salaryId,
          sourceId: source.id,
        });
        expect(
          await api.income.confirm.mutate({
            transactionId: f.salaryId,
            sourceId: source.id,
          }),
        ).toEqual(first);

        for (const transactionId of [f.internalId, f.debitId, f.futureId])
          await expect(
            api.income.confirm.mutate({ transactionId, sourceId: source.id }),
          ).rejects.toMatchObject({ data: { code: "BAD_REQUEST" } });

        const summary = await api.income.summary.query({ month: "2026-09" });
        expect(summary).toMatchObject({
          receivedIncome: "1480000.00",
          expectedIncome: { amount: "1500000.00" },
          unclassifiedCredits: { amount: "20000.00", count: 1 },
        });
        expect(summary.receipts).toHaveLength(1);
        expect(
          await api.summaries.monthly.query({ month: "2026-09" }),
        ).toMatchObject({
          receivedIncome: summary.receivedIncome,
          expectedIncome: summary.expectedIncome,
          unclassifiedCredits: summary.unclassifiedCredits,
          spending: "100000.00",
        });
        const mcp = await request(f.app.getHttpServer())
          .post("/mcp")
          .set("Authorization", `Bearer ${f.token}`)
          .set("Accept", "application/json, text/event-stream")
          .send({
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: {
              name: "consultar_ingresos",
              arguments: { month: "2026-09" },
            },
          })
          .expect(200);
        expect(mcp.body.result.isError).not.toBe(true);
        expect(mcp.body.result.structuredContent).toMatchObject({
          receivedIncome: summary.receivedIncome,
          expectedIncome: summary.expectedIncome,
          receipts: summary.receipts,
        });
        await api.income.clear.mutate({ id: f.salaryId });
        expect(
          await api.income.summary.query({ month: "2026-09" }),
        ).toMatchObject({
          receivedIncome: "0.00",
          unclassifiedCredits: { amount: "1500000.00", count: 2 },
        });
      }, true);
    });
    it("isolates sources/expectations/receipts and hides malformed owner-inserted foreign links", async () => {
      await withApi(async (f) => {
        const own = f.client(),
          other = f.client(f.otherToken);
        const source = await own.income.createSource.mutate(sourceInput());
        const foreign = await other.income.createSource.mutate(
          sourceInput({
            regularity: "irregular",
            amountKind: "variable",
            expectedAmount: null,
            schedule: null,
          }),
        );
        const expectation = await other.income.createExpectation.mutate({
          sourceId: foreign.id,
          expectation: { date: "2026-09-21", amount: "2000.00" },
        });
        expect((await own.income.sources.query()).map((row) => row.id)).toEqual(
          [source.id],
        );

        for (const operation of [
          () => own.income.source.query({ id: foreign.id }),
          () => own.income.archiveSource.mutate({ id: foreign.id }),
          () =>
            own.income.updateSource.mutate({
              id: foreign.id,
              source: sourceInput(),
            }),
          () => own.income.expectations.query({ id: foreign.id }),
          () =>
            own.income.createExpectation.mutate({
              sourceId: foreign.id,
              expectation: { date: "2026-09-21", amount: "1.00" },
            }),
          () =>
            own.income.updateExpectation.mutate({
              id: expectation.id,
              expectation: { date: "2026-09-21", amount: "1.00" },
            }),
          () => own.income.removeExpectation.mutate({ id: expectation.id }),
          () =>
            own.income.confirm.mutate({
              transactionId: f.salaryId,
              sourceId: foreign.id,
            }),
          () =>
            own.income.confirm.mutate({
              transactionId: f.otherTransactionId,
              sourceId: source.id,
            }),
          () => own.income.clear.mutate({ id: f.otherTransactionId }),
        ])
          await expect(operation()).rejects.toMatchObject({
            data: { code: "NOT_FOUND" },
          });

        await f.db.insert("income_receipt", {
          transactionId: f.salaryId,
          sourceId: foreign.id,
        });

        for (const api of [own, other])
          expect(
            await api.income.summary.query({ month: "2026-09" }),
          ).toMatchObject({ receivedIncome: "0.00", receipts: [] });

        // Only owner fixture tooling can create this corrupt row; runtime RLS cannot overwrite it.
        await expect(
          own.income.confirm.mutate({
            transactionId: f.salaryId,
            sourceId: source.id,
          }),
        ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
      });
    });
    it("compares equivalent observed periods while retaining the full-month expectation plan", async () => {
      await withApi(async (f) => {
        const source = await f
          .client()
          .income.createSource.mutate(sourceInput());
        const income = f.app.get(IncomeService);

        for (const [amount, date] of [
          ["400.00", "2026-09-10"],
          ["500.00", "2026-10-10"],
          ["900.00", "2026-10-20"],
        ]) {
          const row = await f.db.insert("transaction", {
            accountId: f.accountId,
            amount,
            type: "credit",
            bookedAt: new Date(`${date}T15:00:00Z`),
            isInternalMovement: false,
          });
          await income.confirmReceiptForUser(
            f.userId,
            row.id,
            { sourceId: source.id },
            new Date("2026-10-21T15:00:00Z"),
          );
        }

        await income.confirmReceiptForUser(f.userId, f.salaryId, {
          sourceId: source.id,
        });
        const summaries = f.app.get(SummariesService),
          now = new Date("2026-10-16T15:00:00Z");
        expect(
          (await summaries.getComparisonForUser(f.userId, "2026-10", now))
            .receivedIncome,
        ).toEqual({ current: "500.00", previous: "400.00", change: "100.00" });
        expect(
          await summaries.getMonthlyForUser(f.userId, "2026-10", now),
        ).toMatchObject({
          expectedIncome: { amount: "1500000.00" },
          receivedIncome: "500.00",
        });
        expect(
          await f.db.rows("income_receipt", { sourceId: source.id }),
        ).toHaveLength(4);
      });
    });
  },
);
