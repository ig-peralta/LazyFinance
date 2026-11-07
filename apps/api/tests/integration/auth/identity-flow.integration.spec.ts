import { randomUUID } from "node:crypto";
import type { VerifiedExternalIdentity } from "@lazyfinance/contracts";
import { describe, expect, it, vi } from "vitest";
import {
  mockEmail,
  mockIdentity,
  mockToken,
} from "../../../src/auth/mock/mock-auth.constants";
import { BankingIngestionService } from "../../../src/banking/ingestion/banking-ingestion.service";
import { identityApi } from "../../fixtures/identity-api";
import { integration } from "../../fixtures/persistence";

async function ownedFlow(
  api: Awaited<ReturnType<typeof identityApi>>,
  firstToken: string,
  secondToken: string,
) {
  const first = api.client(firstToken),
    second = api.client(secondToken);
  const a = await first.auth.principal.query(),
    b = await second.auth.principal.query();
  expect(a.userId).not.toBe(b.userId);
  expect(await first.auth.principal.query()).toEqual(a);
  const provider = await api.db.insert("provider", {
    identifier: `identity-${randomUUID()}`,
  });
  const accounts: { id: string }[] = [],
    movements: { id: string }[] = [],
    objectives: { id: string }[] = [],
    connections: { id: string }[] = [];

  for (const principal of [a, b]) {
    const connection = await api.db.insert("provider_connection", {
      userId: principal.userId,
      providerId: provider.id,
      mode: "test",
    });
    const account = await api.db.insert("account", {
      userId: principal.userId,
      providerConnectionId: connection.id,
      type: "checking",
      balance: "100.00",
    });
    const movement = await api.db.insert("transaction", {
      accountId: account.id,
      type: "credit",
      amount: "50.00",
      bookedAt: new Date("2026-10-15T12:00:00Z"),
      isInternalMovement: false,
    });
    const objective = await api.db.insert("objective", {
      userId: principal.userId,
      name: "Savings",
      amount: "100.00",
      kind: "amount_based",
      intent: "saving",
    });
    accounts.push(account);
    movements.push(movement);
    objectives.push(objective);
    connections.push(connection);
  }

  const fetchPage = vi.fn();
  await expect(
    api.app
      .get(BankingIngestionService)
      .syncForUser(b.userId, connections[0].id, {
        provider: "fixture-bank",
        fetchPage,
      }),
  ).rejects.toThrow("Banking connection not found");
  expect(fetchPage).not.toHaveBeenCalled();
  expect((await first.accounts.list.query()).map((row) => row.id)).toEqual([
    accounts[0].id,
  ]);
  expect((await second.accounts.list.query()).map((row) => row.id)).toEqual([
    accounts[1].id,
  ]);
  expect(
    (await first.transactions.recent.query()).map((row) => row.id),
  ).toEqual([movements[0].id]);
  expect((await second.objectives.list.query()).map((row) => row.id)).toEqual([
    objectives[1].id,
  ]);
  await expect(
    second.tags.suggestions.query({ id: movements[0].id }),
  ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
  const tag = await first.tags.create.mutate({ name: "First" });
  await expect(
    first.tags.decide.mutate({ transactionId: movements[1].id, tagId: tag.id }),
  ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
  const source = await first.income.createSource.mutate({
    name: "Income",
    regularity: "irregular",
    amountKind: "variable",
    startDate: "2026-01-01",
  });
  const other = await second.income.createSource.mutate({
    name: "Other income",
    regularity: "irregular",
    amountKind: "variable",
    startDate: "2026-01-01",
  });
  const expectation = await first.income.createExpectation.mutate({
    sourceId: source.id,
    expectation: { date: "2026-10-15", amount: "50.00" },
  });
  await first.income.confirm.mutate({
    transactionId: movements[0].id,
    sourceId: source.id,
  });
  await second.income.confirm.mutate({
    transactionId: movements[1].id,
    sourceId: other.id,
  });

  for (const operation of [
    () => second.income.source.query({ id: source.id }),
    () => second.income.removeExpectation.mutate({ id: expectation.id }),
    () =>
      second.income.confirm.mutate({
        transactionId: movements[0].id,
        sourceId: other.id,
      }),
    () => second.income.clear.mutate({ id: movements[0].id }),
    () =>
      first.income.confirm.mutate({
        transactionId: movements[0].id,
        sourceId: other.id,
      }),
  ])
    await expect(operation()).rejects.toMatchObject({
      data: { code: "NOT_FOUND" },
    });

  expect(
    (await first.income.receipts.query({ month: "2026-10" })).map(
      (row) => row.transactionId,
    ),
  ).toEqual([movements[0].id]);
  expect(
    (await second.income.receipts.query({ month: "2026-10" })).map(
      (row) => row.transactionId,
    ),
  ).toEqual([movements[1].id]);
  expect(
    (await first.income.summary.query({ month: "2026-10" })).receivedIncome,
  ).toBe("50.00");
}

describe.skipIf(!integration)(
  "public bearer identity → private user RLS end-to-end",
  () => {
    it("checks repeated provisioning and distinct-user financial ownership", async () => {
      const first = randomUUID(),
        second = randomUUID(),
        issuer = "https://securetoken.google.com/lazyfinance-dev";
      const identities = new Map<string, VerifiedExternalIdentity>(
        [first, second].map((token) => [
          token,
          {
            provider: "firebase",
            issuer,
            providerSubject: randomUUID(),
            verifiedEmail: `${randomUUID()}@example.test`,
            displayName: "Owner",
          },
        ]),
      );
      const api = await identityApi(identities);

      try {
        await ownedFlow(api, first, second);
      } finally {
        await api.close();
      }
    });
    it("keeps demo login linked only to its seeded identity in mock mode", async () => {
      const api = await identityApi(undefined, "mock");

      try {
        await api.db.pool.query(
          `INSERT INTO identity."user"(email,name) VALUES ($1,'Demo') ON CONFLICT DO NOTHING`,
          [mockEmail],
        );
        const demo = (await api.db.rows("user", { email: mockEmail }))[0];
        await api.db.pool.query(
          `INSERT INTO identity.external_identity(provider,issuer,provider_subject,user_id) VALUES ('mock',$1,$2,$3) ON CONFLICT DO NOTHING`,
          [mockIdentity.issuer, mockIdentity.providerSubject, demo.id],
        );
        const link = (
          await api.db.rows("external_identity", {
            provider: "mock",
            issuer: mockIdentity.issuer,
            providerSubject: mockIdentity.providerSubject,
          })
        )[0];
        expect(await api.client().auth.config.query()).toEqual({
          provider: "mock",
        });
        expect(
          await api
            .client()
            .auth.loginMock.mutate({ email: mockEmail, password: "password" }),
        ).toEqual({ token: mockToken });
        expect(
          (await api.client(mockToken).auth.principal.query()).userId,
        ).toBe(link.user_id);
        await expect(
          api.client("header.payload.signature").auth.principal.query(),
        ).rejects.toMatchObject({ data: { code: "UNAUTHORIZED" } });
      } finally {
        await api.close();
      }
    });
    it.skipIf(
      !process.env.TEST_FIREBASE_ID_TOKEN_A ||
        !process.env.TEST_FIREBASE_ID_TOKEN_B,
    )(
      "verifies two live Firebase tokens before applying the same ownership checks",
      async () => {
        const api = await identityApi();

        try {
          const a = process.env.TEST_FIREBASE_ID_TOKEN_A!,
            b = process.env.TEST_FIREBASE_ID_TOKEN_B!;
          const [header, payload, signature] = a.split(".");
          await expect(
            api
              .client(
                `${header}.${payload}.${signature[0] === "x" ? "y" : "x"}${signature.slice(1)}`,
              )
              .auth.principal.query(),
          ).rejects.toMatchObject({ data: { code: "UNAUTHORIZED" } });
          await ownedFlow(api, a, b);

          if (process.env.TEST_FIREBASE_EXPIRED_ID_TOKEN)
            await expect(
              api
                .client(process.env.TEST_FIREBASE_EXPIRED_ID_TOKEN)
                .auth.principal.query(),
            ).rejects.toMatchObject({ data: { code: "UNAUTHORIZED" } });
        } finally {
          await api.close();
        }
      },
      30000,
    );
  },
);
