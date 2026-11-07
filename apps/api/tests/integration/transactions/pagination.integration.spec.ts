import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { fixture, integration, startApi } from "../../fixtures/persistence";

describe.skipIf(!integration)(
  "transaction cursor pages through both RPC boundaries",
  () => {
    it("preserves exact boundaries, ownership, filters and recent-preview semantics", async () => {
      const f = await fixture(true);

      try {
        const tagId = randomUUID();
        await f.db.insert("tag", {
          id: tagId,
          userId: f.userId,
          name: "Archived history",
          isArchived: true,
        });
        const movements = Array.from({ length: 12 }, (_, index) => ({
          id: randomUUID(),
          bookedAt: `2026-10-15T15:00:00.${index === 0 ? "123457" : index < 3 ? "123456" : "123455"}Z`,
        })).sort(
          (left, right) =>
            right.bookedAt.localeCompare(left.bookedAt) ||
            right.id.localeCompare(left.id),
        );

        for (const [index, movement] of movements.entries())
          await f.db.insert("transaction", {
            ...movement,
            accountId: f.accountId,
            amount: "-9007199254740.99",
            type: "debit",
            merchant: `Movement ${index}`,
            tagId: index === 1 ? tagId : null,
            tagDecisionOrigin: index === 1 ? "manual" : "unreviewed",
            reviewStatus: index === 2 ? "needs_review" : "clear",
          });

        const secondAccountId = randomUUID();
        await f.db.insert("account", {
          id: secondAccountId,
          userId: f.userId,
          providerConnectionId: f.connectionId,
          type: "savings",
        });
        const secondAccountMovement = randomUUID();
        await f.db.insert("transaction", {
          id: secondAccountMovement,
          accountId: secondAccountId,
          bookedAt: "2026-10-16T00:00:00.000000Z",
          amount: "1.00",
          type: "credit",
        });
        for (const [accountId, removed] of [
          [f.accountId, true],
          [f.otherAccountId, false],
        ] as const)
          await f.db.insert("transaction", {
            accountId,
            bookedAt: "2026-10-17T00:00:00.000000Z",
            amount: "1.00",
            type: "credit",
            removedAt: removed ? "2026-10-18T00:00:00Z" : null,
            removalReason: removed ? "removed" : null,
          });

        const { app, client } = await startApi(f);

        try {
          const own = client();
          const complete = await own.transactions.list.query({});
          const expectedIds = [
            secondAccountMovement,
            ...movements.map((row) => row.id),
          ];
          expect(complete.items.map((row) => row.id)).toEqual(expectedIds);
          expect(complete.pageInfo).toEqual({
            hasMore: false,
            nextCursor: null,
          });
          expect(await own.transactions.recent.query()).toEqual(
            complete.items.slice(0, 10),
          );

          const first = await own.transactions.list.query({
            limit: 2,
            accountId: f.accountId,
          });
          expect(first.items.map((row) => row.id)).toEqual(
            movements.slice(0, 2).map((row) => row.id),
          );
          expect(first.items[1]).toMatchObject({
            amount: "-9007199254740.99",
            account: { id: f.accountId, type: "checking", currency: "CLP" },
            tag: { id: tagId, name: "Archived history" },
            tagDecisionOrigin: "manual",
          });
          expect(first.pageInfo.hasMore).toBe(true);
          const firstCursor = first.pageInfo.nextCursor;
          if (!firstCursor) throw new Error("Expected a continuation cursor");
          expect(first.items[0]).not.toHaveProperty("cursorBookedAt");

          // Removing the boundary row must not prevent continuation. Inserting a
          // newer movement must not shift unchanged older records across pages.
          await f.db.update("transaction", movements[1].id, {
            removedAt: "2026-10-18T00:00:00Z",
            removalReason: "removed",
          });
          await f.db.insert("transaction", {
            accountId: f.accountId,
            bookedAt: "2026-10-19T00:00:00.000000Z",
            amount: "1.00",
            type: "credit",
          });

          const seen = first.items.map((row) => row.id);
          let cursor: string | null = firstCursor;
          let lastSize = 0;
          while (cursor) {
            const page = await own.transactions.list.query({
              accountId: f.accountId,
              cursor,
              limit: 2,
            });
            seen.push(...page.items.map((row) => row.id));
            lastSize = page.items.length;
            cursor = page.pageInfo.nextCursor;
            expect(page.pageInfo.hasMore).toBe(cursor !== null);
            expect(seen.length).toBeLessThanOrEqual(movements.length);
          }
          expect(seen).toEqual(movements.map((row) => row.id));
          expect(lastSize).toBe(2); // Exactly full final pages have no continuation.

          const beforeHistory = Buffer.from(
            JSON.stringify({
              version: 1,
              id: movements[0].id,
              bookedAt: "2020-01-01T00:00:00.000000Z",
              accountId: f.accountId,
            }),
          ).toString("base64url");
          expect(
            await own.transactions.list.query({
              cursor: beforeHistory,
              accountId: f.accountId,
            }),
          ).toEqual({
            items: [],
            pageInfo: { hasMore: false, nextCursor: null },
          });
          expect(
            await own.transactions.list.query({ accountId: f.otherAccountId }),
          ).toEqual({
            items: [],
            pageInfo: { hasMore: false, nextCursor: null },
          });
          // Possessing another owner's valid cursor does not grant row access.
          expect(
            await client(f.otherToken).transactions.list.query({
              accountId: f.accountId,
              cursor: firstCursor,
            }),
          ).toEqual({
            items: [],
            pageInfo: { hasMore: false, nextCursor: null },
          });

          for (const input of [
            { cursor: "malformed" },
            { cursor: firstCursor }, // Changed account filter.
            { limit: 0 },
            { limit: 101 },
          ])
            await expect(
              own.transactions.list.query(input),
            ).rejects.toMatchObject({
              data: { code: "BAD_REQUEST" },
            });
        } finally {
          await app.close();
        }
      } finally {
        await f.db.close();
      }
    });
  },
);
