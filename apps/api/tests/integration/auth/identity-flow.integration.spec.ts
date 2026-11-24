import { randomUUID } from "node:crypto";
import type { VerifiedExternalIdentity } from "@lazyfinance/contracts";
import { describe, expect, it, vi } from "vitest";
import { mockIdentity } from "../../../src/auth/mock/mock-auth.constants";
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
    it("creates one owner per normalized mock email and prepares only the signed-in owner's demo", async () => {
      const api = await identityApi(undefined, {
        provider: "mock",
        demoTools: true,
      });

      try {
        const auth = api.client().auth;
        const email = `mock-${randomUUID()}@example.test`;
        const [first, repeat, another] = await Promise.all([
          auth.loginMock.mutate({ email, password: "x" }),
          auth.loginMock.mutate({
            email: ` ${email.toUpperCase()} `,
            password: "another",
          }),
          auth.loginMock.mutate({
            email: `other-${randomUUID()}@example.test`,
            password: "x",
          }),
        ]);
        expect(new Set([first.token, repeat.token, another.token]).size).toBe(
          3,
        );
        const user = api.client(first.token);
        const otherUser = api.client(another.token);
        const principal = await user.auth.principal.query();
        expect(principal.email).toBe(email);
        expect(await api.client(repeat.token).auth.principal.query()).toEqual(
          principal,
        );
        expect((await otherUser.auth.principal.query()).userId).not.toBe(
          principal.userId,
        );
        expect(await api.db.rows("user", { email })).toHaveLength(1);
        expect(
          await api.db.rows("external_identity", { userId: principal.userId }),
        ).toMatchObject([
          {
            provider: "mock",
            issuer: mockIdentity.issuer,
            provider_subject: `email:${email}`,
          },
        ]);

        expect(await user.accounts.list.query()).toEqual([]);
        expect(await user.banking.connections.query()).toEqual([]);
        expect(await user.objectives.list.query()).toEqual([]);
        const demo = await user.demoTools.resetDemoData.mutate();
        expect(demo.status).toBe("ready");
        expect(demo.transactionCount).toBeGreaterThan(0);
        expect(await user.accounts.list.query()).toHaveLength(3);
        expect(await otherUser.accounts.list.query()).toEqual([]);
        expect(await otherUser.banking.connections.query()).toEqual([]);
        await expect(
          api.client("lazyfinance-demo-token").auth.principal.query(),
        ).rejects.toMatchObject({ data: { code: "UNAUTHORIZED" } });
      } finally {
        await api.close();
      }
    }, 45000);

    it("keeps the existing legacy demo mapping and profile unchanged", async () => {
      const api = await identityApi(undefined, { provider: "mock" });

      try {
        const mappingKey = {
          provider: mockIdentity.provider,
          issuer: mockIdentity.issuer,
          providerSubject: mockIdentity.providerSubject,
        };
        let [link] = await api.db.rows("external_identity", mappingKey);
        if (!link) {
          const existing = await api.db.insert("user", {
            email: `legacy-${randomUUID()}@example.test`,
            name: "Existing mock profile",
          });
          link = await api.db.insert("external_identity", {
            ...mappingKey,
            userId: existing.id,
          });
        }

        const [profile] = await api.db.rows("user", { id: link.user_id });
        const { token } = await api.client().auth.loginMock.mutate({
          email: mockIdentity.verifiedEmail.toUpperCase(),
          password: "local fixture",
        });
        expect(await api.client(token).auth.principal.query()).toEqual({
          userId: profile.id,
          email: profile.email,
          name: profile.name,
        });
        expect(await api.db.rows("external_identity", mappingKey)).toEqual([
          link,
        ]);
        expect(await api.db.rows("user", { id: profile.id })).toEqual([
          profile,
        ]);
      } finally {
        await api.close();
      }
    });

    it("rejects a mock login that would claim a Firebase user's email", async () => {
      const api = await identityApi(undefined, { provider: "mock" });

      try {
        const email = `firebase-${randomUUID()}@example.test`;
        const user = await api.db.insert("user", {
          email,
          name: "Firebase test user",
        });
        const firebase = await api.db.insert("external_identity", {
          provider: "firebase",
          issuer: "https://securetoken.google.com/test",
          providerSubject: randomUUID(),
          userId: user.id,
        });
        await expect(
          api.client().auth.loginMock.mutate({
            email: email.toUpperCase(),
            password: "x",
          }),
        ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
        expect(
          await api.db.rows("external_identity", { userId: user.id }),
        ).toEqual([firebase]);
        expect(await api.db.rows("user", { email })).toEqual([user]);
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
