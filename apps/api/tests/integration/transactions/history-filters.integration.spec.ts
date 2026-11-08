import { describe, expect, it } from "vitest";
import { fixture, integration, startApi } from "../../fixtures/persistence";

describe.skipIf(!integration)("filtered owned transaction history", () => {
  it("applies Santiago dates, archived/null tags, direction, three internal states and literal merchant search before pagination", async () => {
    const f = await fixture(true),
      api = await startApi(f);
    try {
      const client = api.client(),
        tag = await client.tags.create.mutate({ name: "History" });
      const expected: string[] = [];
      for (const [date, internal, merchant, amount, selected, accountId] of [
        [
          "2026-09-01T03:59:59.999999Z",
          false,
          "Store%_",
          "-1.00",
          true,
          f.accountId,
        ],
        [
          "2026-09-01T04:00:00.000000Z",
          false,
          "store%_",
          "-2.00",
          true,
          f.accountId,
        ],
        [
          "2026-09-10T15:00:00.123456Z",
          false,
          "STORE%_",
          "-3.00",
          true,
          f.accountId,
        ],
        [
          "2026-09-10T15:00:00.123457Z",
          false,
          "Store%_",
          "-4.00",
          true,
          f.accountId,
        ],
        [
          "2026-09-10T15:00:00.123458Z",
          true,
          "Store%_",
          "-5.00",
          true,
          f.accountId,
        ],
        [
          "2026-09-10T15:00:00.123459Z",
          null,
          "Store%_",
          "-6.00",
          true,
          f.accountId,
        ],
        [
          "2026-09-10T15:00:00.123460Z",
          false,
          "StoreXX",
          "-7.00",
          true,
          f.accountId,
        ],
        [
          "2026-09-10T15:00:00.123461Z",
          false,
          "Store%_",
          "8.00",
          true,
          f.accountId,
        ],
        [
          "2026-09-10T15:00:00.123462Z",
          false,
          "Store%_",
          "-9.00",
          false,
          f.accountId,
        ],
        [
          "2026-10-01T03:00:00.000000Z",
          false,
          "Store%_",
          "-10.00",
          true,
          f.accountId,
        ],
        [
          "2026-09-11T15:00:00Z",
          false,
          "Store%_",
          "-11.00",
          false,
          f.otherAccountId,
        ],
      ] as const) {
        const row = await f.db.insert("transaction", {
          accountId,
          amount,
          type: amount.startsWith("-") ? "debit" : "credit",
          bookedAt: date,
          merchant,
          isInternalMovement: internal,
          tagId: selected ? tag.id : null,
          tagDecisionOrigin: "manual",
        });
        if (["-2.00", "-3.00", "-4.00"].includes(amount))
          expected.unshift(row.id);
      }
      await client.tags.archive.mutate({ id: tag.id });
      const filters = {
        accountId: f.accountId,
        bookedFrom: "2026-09-01",
        bookedBefore: "2026-10-01",
        tagId: tag.id,
        type: "debit" as const,
        isInternalMovement: false,
        merchant: " Store%_ ",
      };
      const first = await client.transactions.list.query({
        ...filters,
        limit: 1,
      });
      expect(first.items[0].id).toBe(expected[0]);
      if (!first.pageInfo.nextCursor) throw new Error("Expected continuation");
      const next = await client.transactions.list.query({
        ...filters,
        merchant: "Store%_",
        cursor: first.pageInfo.nextCursor,
        limit: 100,
      });
      expect([...first.items, ...next.items].map((row) => row.id)).toEqual(
        expected,
      );
      expect(
        (
          await client.transactions.list.query({
            ...filters,
            isInternalMovement: true,
          })
        ).items.map((row) => row.amount),
      ).toEqual(["-5.00"]);
      expect(
        (
          await client.transactions.list.query({
            ...filters,
            isInternalMovement: null,
          })
        ).items.map((row) => row.amount),
      ).toEqual(["-6.00"]);
      expect(
        (
          await client.transactions.list.query({ ...filters, tagId: null })
        ).items.map((row) => row.amount),
      ).toEqual(["-9.00"]);
      expect(
        (
          await api.client(f.otherToken).transactions.list.query({
            ...filters,
            cursor: first.pageInfo.nextCursor,
          })
        ).items,
      ).toEqual([]);
      for (const change of [
        { bookedFrom: "2026-09-02" },
        { tagId: null },
        { isInternalMovement: null },
        { type: "credit" as const },
        { merchant: "Store" },
      ])
        await expect(
          client.transactions.list.query({
            ...filters,
            ...change,
            cursor: first.pageInfo.nextCursor,
          }),
        ).rejects.toMatchObject({ data: { code: "BAD_REQUEST" } });
      for (const change of [
        { bookedFrom: "2026-02-30" },
        { bookedFrom: "2026-10-01" },
        { merchant: " " },
      ])
        await expect(
          client.transactions.list.query({ ...filters, ...change }),
        ).rejects.toMatchObject({ data: { code: "BAD_REQUEST" } });
    } finally {
      await api.app.close();
      await f.db.close();
    }
  });
});
