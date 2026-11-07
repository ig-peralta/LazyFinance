import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { santiagoMonth } from "../../../src/utils/santiago-time";
import { fixture, integration, startApi } from "../../fixtures/persistence";

describe.skipIf(!integration)(
  "budget management through both RPC boundaries",
  () => {
    it("retains financial revisions, rejects foreign/stale writes, pages history and archives prospectively", async () => {
      const f = await fixture(true);
      const api = await startApi(f);
      try {
        const client = api.client();
        const other = api.client(f.otherToken);
        const tag = await client.tags.create.mutate({
          name: "Budget groceries",
        });
        const foreign = await other.tags.create.mutate({
          name: "Foreign groceries",
        });
        const month = santiagoMonth(new Date());
        const input = {
          name: "Groceries",
          amount: "280000",
          tagIds: [tag.id],
          schedule: { period: "monthly" as const, startDate: `${month}-01` },
        };
        const beforeInvalid = await f.db.rows("objective", {
          userId: f.userId,
        });
        await expect(
          client.objectives.createBudget.mutate({
            ...input,
            tagIds: [foreign.id],
          }),
        ).rejects.toMatchObject({ data: { code: "BAD_REQUEST" } });
        expect(await f.db.rows("objective", { userId: f.userId })).toEqual(
          beforeInvalid,
        );

        const created = await client.objectives.createBudget.mutate(input);
        expect(created).toMatchObject({
          version: 1,
          pending: null,
          effective: { amount: "280000.00", tags: [{ id: tag.id }] },
        });
        if (!created.effective)
          throw new Error("Expected an active current-month budget");
        const id = created.id;
        for (const work of [
          () => other.objectives.budget.query({ id }),
          () => other.objectives.budgetHistory.query({ id }),
          () =>
            other.objectives.updateBudget.mutate({
              id,
              expectedVersion: 1,
              budget: { name: "Foreign", amount: "1", tagIds: [foreign.id] },
            }),
          () =>
            other.objectives.archiveBudget.mutate({ id, expectedVersion: 1 }),
        ])
          await expect(work()).rejects.toMatchObject({
            data: { code: "NOT_FOUND" },
          });

        const edits = await Promise.allSettled(
          ["320000", "330000"].map((amount) =>
            client.objectives.updateBudget.mutate({
              id,
              expectedVersion: 1,
              budget: { name: "Groceries", amount, tagIds: [tag.id] },
            }),
          ),
        );
        expect(
          edits.filter((result) => result.status === "fulfilled"),
        ).toHaveLength(1);
        const rejected = edits.find((result) => result.status === "rejected");
        expect(rejected).toMatchObject({
          reason: { data: { code: "CONFLICT" } },
        });
        const updated = await client.objectives.budget.query({ id });
        expect(updated).toMatchObject({
          version: 2,
          effective: { id: created.effective.id, amount: "280000.00" },
          pending: { version: 2 },
        });
        const replacement = await client.objectives.updateBudget.mutate({
          id,
          expectedVersion: 2,
          budget: {
            name: "Groceries next period",
            amount: "340000",
            tagIds: [tag.id],
          },
        });
        expect(replacement).toMatchObject({
          version: 3,
          effective: { amount: "280000.00" },
          pending: { version: 3, amount: "340000.00" },
        });

        const page = await client.objectives.budgetHistory.query({
          id,
          limit: 1,
        });
        expect(page.items.map((revision) => revision.version)).toEqual([3]);
        expect(page.pageInfo.hasMore).toBe(true);
        const cursor = page.pageInfo.nextCursor;
        if (!cursor) throw new Error("Expected a budget history continuation");
        const second = await client.objectives.budgetHistory.query({
          id,
          limit: 1,
          cursor,
        });
        expect(second.items[0]).toMatchObject({
          version: 2,
          supersededAt: expect.any(String),
        });
        const another = await client.objectives.createBudget.mutate({
          ...input,
          name: "Another budget",
        });
        await expect(
          client.objectives.budgetHistory.query({
            id: another.id,
            cursor,
          }),
        ).rejects.toMatchObject({ data: { code: "BAD_REQUEST" } });

        const bookedAt = new Date(
          (Date.parse(created.effective.effectiveFrom) + Date.now()) / 2,
        );
        const insertMovement = (amount: string, at: Date) =>
          f.db.insert("transaction", {
            id: randomUUID(),
            accountId: f.accountId,
            bookedAt: at,
            amount,
            type: "debit",
            tagId: tag.id,
            tagDecisionOrigin: "manual",
            isInternalMovement: false,
            reviewStatus: "clear",
          });
        const movement = await insertMovement("-20000.00", bookedAt);
        const progress = (
          await client.objectives.progress.query({ month })
        ).find((row) => row.id === id);
        expect(progress).toMatchObject({
          revisionId: created.effective.id,
          limit: "280000.00",
          spent: "20000.00",
          remaining: "260000.00",
        });

        const archived = await client.objectives.archiveBudget.mutate({
          id,
          expectedVersion: 3,
        });
        expect(archived).toMatchObject({
          version: 4,
          archivedAt: expect.any(String),
          pending: null,
        });
        expect(
          await client.objectives.archiveBudget.mutate({
            id,
            expectedVersion: 3,
          }),
        ).toEqual(archived);
        expect(
          (await client.objectives.list.query()).some((row) => row.id === id),
        ).toBe(false);
        if (!archived.archivedAt)
          throw new Error("Expected an archival cutoff");
        const cutoff = new Date(archived.archivedAt);
        await insertMovement("-5000.00", cutoff);
        await insertMovement("-7000.00", new Date(cutoff.getTime() + 1));
        await insertMovement("-3000.00", bookedAt);
        const historical = (
          await client.objectives.progress.query({ month })
        ).find((row) => row.id === id);
        expect(historical).toMatchObject({
          limit: "280000.00",
          spent: "23000.00",
          remaining: "257000.00",
          tracking: {
            end: archived.archivedAt,
            archivedAt: archived.archivedAt,
          },
        });
        expect(
          (await f.db.rows("account", { id: f.accountId }))[0].balance,
        ).toBe("500000.00");
        expect(
          (await f.db.rows("transaction", { id: movement.id }))[0],
        ).toMatchObject({ amount: "-20000.00", booked_at: bookedAt });
        await expect(
          client.objectives.updateBudget.mutate({
            id,
            expectedVersion: 4,
            budget: { name: "Changed", amount: "1", tagIds: [tag.id] },
          }),
        ).rejects.toMatchObject({ data: { code: "BAD_REQUEST" } });
        const history = await client.objectives.budgetHistory.query({ id });
        expect(history.items).toHaveLength(3);
        expect(
          history.items
            .filter((revision) => revision.version > 1)
            .every((revision) => revision.supersededAt !== null),
        ).toBe(true);
      } finally {
        await api.app.close();
        await f.db.close();
      }
    });

    it("validates archived tags atomically and allows fixed replacements only before activation", async () => {
      const f = await fixture();
      const api = await startApi(f);
      try {
        const client = api.client();
        const tag = await client.tags.create.mutate({ name: "Fixed budget" });
        const today = new Intl.DateTimeFormat("sv-SE", {
          timeZone: "America/Santiago",
        }).format(new Date());
        const fields = { name: "Today", amount: "100", tagIds: [tag.id] };
        const started = await client.objectives.createBudget.mutate({
          ...fields,
          schedule: { period: "fixed", startDate: today, endDate: today },
        });
        await expect(
          client.objectives.updateBudget.mutate({
            id: started.id,
            expectedVersion: 1,
            budget: { ...fields, amount: "200" },
          }),
        ).rejects.toMatchObject({ data: { code: "BAD_REQUEST" } });
        const future = await client.objectives.createBudget.mutate({
          ...fields,
          schedule: {
            period: "fixed",
            startDate: "2099-01-01",
            endDate: "2099-01-02",
          },
        });
        const replaced = await client.objectives.updateBudget.mutate({
          id: future.id,
          expectedVersion: 1,
          budget: {
            ...fields,
            amount: "200",
            schedule: {
              period: "fixed",
              startDate: "2099-02-01",
              endDate: "2099-02-03",
            },
          },
        });
        expect(replaced).toMatchObject({
          version: 2,
          effective: null,
          pending: {
            amount: "200.00",
            startDate: "2099-02-01T03:00:00.000000Z",
            endDate: "2099-02-04T03:00:00.000000Z",
          },
        });
        const pending = replaced.pending;
        if (!pending?.startDate)
          throw new Error("Expected a pending fixed definition");
        // This private command passes input validation, supersedes the pending
        // row, then fails a revision CHECK. The whole mutation must roll back.
        await expect(
          f.persistence.user(f.userId).objectives.updateBudget.mutate({
            id: future.id,
            expectedVersion: 2,
            wasStarted: false,
            effectiveFrom: "2099-03-01 00:00:00",
            budget: {
              name: pending.name,
              amount: "300.00",
              tagIds: [tag.id],
              isRecurring: false,
              period: null,
              startDate: pending.startDate,
              endDate: pending.endDate,
            },
          }),
        ).rejects.toMatchObject({ data: { code: "BAD_REQUEST" } });
        expect(await client.objectives.budget.query({ id: future.id })).toEqual(
          replaced,
        );
        await f.db.update("tag", tag.id, { isArchived: true });
        await expect(
          client.objectives.updateBudget.mutate({
            id: future.id,
            expectedVersion: 2,
            budget: { ...fields, amount: "300" },
          }),
        ).rejects.toMatchObject({ data: { code: "BAD_REQUEST" } });
        expect(await client.objectives.budget.query({ id: future.id })).toEqual(
          replaced,
        );
        expect(
          (await client.objectives.budgetHistory.query({ id: future.id }))
            .items,
        ).toHaveLength(2);
      } finally {
        await api.app.close();
        await f.db.close();
      }
    });

    it("validates public configurations and keeps annual progress cumulative while scheduling next-year edits", async () => {
      const f = await fixture(true);
      const api = await startApi(f);
      try {
        const client = api.client();
        const tag = await client.tags.create.mutate({ name: "Annual budget" });
        const month = santiagoMonth(new Date());
        const year = Number(month.slice(0, 4));
        const input = {
          name: "Annual",
          amount: "650000",
          tagIds: [tag.id],
          schedule: { period: "yearly" as const, startDate: `${year}-01-01` },
        };
        for (const invalid of [
          { ...input, amount: "0" },
          { ...input, tagIds: [tag.id, tag.id] },
          { ...input, userId: f.otherUserId },
          {
            ...input,
            schedule: { period: "daily", startDate: `${year}-01-01` },
          },
          {
            ...input,
            schedule: { period: "weekly", startDate: `${year}-01-01` },
          },
          {
            ...input,
            schedule: { period: "monthly", startDate: `${year}-01-02` },
          },
          {
            ...input,
            schedule: { period: "yearly", startDate: `${year}-02-01` },
          },
          {
            ...input,
            schedule: {
              period: "fixed",
              startDate: `${year}-02-02`,
              endDate: `${year}-02-01`,
            },
          },
        ]) {
          const response = await fetch(
            `${api.url}/trpc/objectives.createBudget`,
            {
              method: "POST",
              headers: {
                "content-type": "application/json",
                authorization: `Bearer ${f.token}`,
              },
              body: JSON.stringify(invalid),
            },
          );
          expect(response.status).toBe(400);
        }
        expect(await f.db.rows("objective", { userId: f.userId })).toEqual([]);
        const created = await client.objectives.createBudget.mutate(input);
        const current = created.effective;
        if (!current?.startDate)
          throw new Error("Expected an active annual definition");
        for (const amount of ["-100.00", "-200.00"])
          await f.db.insert("transaction", {
            accountId: f.accountId,
            bookedAt: current.startDate,
            amount,
            type: "debit",
            tagId: tag.id,
            tagDecisionOrigin: "manual",
            isInternalMovement: false,
            reviewStatus: "clear",
          });
        const edited = await client.objectives.updateBudget.mutate({
          id: created.id,
          expectedVersion: 1,
          budget: {
            name: "Annual next year",
            amount: "700000",
            tagIds: [tag.id],
          },
        });
        expect(edited).toMatchObject({
          effective: { id: current.id, amount: "650000.00" },
          pending: {
            amount: "700000.00",
            effectiveFrom: `${year + 1}-01-01T03:00:00.000000Z`,
          },
        });
        expect(
          (await client.objectives.progress.query({ month })).find(
            (row) => row.id === created.id,
          ),
        ).toMatchObject({
          revisionId: current.id,
          period: "yearly",
          limit: "650000.00",
          spent: "300.00",
          remaining: "649700.00",
          tracking: { start: current.startDate },
        });
      } finally {
        await api.app.close();
        await f.db.close();
      }
    });

    it("uses period-specific tags and limits and preserves exact legacy bounds across Santiago DST", async () => {
      const f = await fixture(true);
      const api = await startApi(f);
      try {
        const client = api.client();
        const tags = await Promise.all(
          ["September", "October", "Legacy fixed"].map((name) =>
            client.tags.create.mutate({ name }),
          ),
        );
        const budgetId = randomUUID();
        await f.db.insert("objective", {
          id: budgetId,
          userId: f.userId,
          name: "Original",
          amount: "280000.00",
          kind: "time_based",
          intent: "spending",
          isRecurring: true,
          period: "monthly",
          startDate: "2026-09-01T04:00:00.000000Z",
          budgetVersion: 2,
        });
        const revisionIds = [randomUUID(), randomUUID()];
        for (const [index, effectiveFrom] of [
          "2026-09-01T04:00:00.000000Z",
          "2026-10-01T03:00:00.000000Z",
        ].entries()) {
          await f.db.insert("budget_revision", {
            id: revisionIds[index],
            objectiveId: budgetId,
            version: index + 1,
            name: index ? "October limit" : "September limit",
            amount: index ? "320000.00" : "280000.00",
            kind: "time_based",
            isRecurring: true,
            period: "monthly",
            startDate: "2026-09-01T04:00:00.000000Z",
            effectiveFrom,
          });
          await f.db.insert("budget_revision_tag", {
            revisionId: revisionIds[index],
            tagId: tags[index].id,
          });
        }
        await f.db.update("tag", tags[0].id, { isArchived: true });
        const movement = (tagId: string, amount: string, bookedAt: string) =>
          f.db.insert("transaction", {
            accountId: f.accountId,
            type: "debit",
            amount,
            bookedAt,
            tagId,
            tagDecisionOrigin: "manual",
            isInternalMovement: false,
            reviewStatus: "clear",
          });
        await movement(tags[0].id, "-100.00", "2026-09-15T15:00:00Z");
        await movement(tags[1].id, "-200.00", "2026-09-15T15:00:00Z");
        await movement(tags[0].id, "-400.00", "2026-10-15T15:00:00Z");
        await movement(tags[1].id, "-300.00", "2026-10-15T15:00:00Z");
        expect(
          (await client.objectives.progress.query({ month: "2026-09" })).find(
            (row) => row.id === budgetId,
          ),
        ).toMatchObject({
          revisionId: revisionIds[0],
          limit: "280000.00",
          spent: "100.00",
        });
        expect(
          (await client.objectives.progress.query({ month: "2026-10" })).find(
            (row) => row.id === budgetId,
          ),
        ).toMatchObject({
          revisionId: revisionIds[1],
          limit: "320000.00",
          spent: "300.00",
        });

        const fixedId = randomUUID();
        const startDate = "2026-09-06T04:00:00.123456Z";
        const endDate = "2026-10-01T03:00:00.123456Z";
        await f.db.insert("objective", {
          id: fixedId,
          userId: f.userId,
          name: "Legacy fixed",
          amount: "100.00",
          kind: "time_based",
          intent: "spending",
          isRecurring: false,
          startDate,
          endDate,
        });
        await f.db.insert("budget_revision", {
          id: fixedId,
          objectiveId: fixedId,
          version: 1,
          name: "Legacy fixed",
          amount: "100.00",
          kind: "time_based",
          isRecurring: false,
          startDate,
          endDate,
          effectiveFrom: startDate,
        });
        await f.db.insert("budget_revision_tag", {
          revisionId: fixedId,
          tagId: tags[2].id,
        });
        await movement(tags[2].id, "-10.00", "2026-09-06T04:00:00.123455Z");
        await movement(tags[2].id, "-1.00", startDate);
        await movement(tags[2].id, "-2.00", "2026-10-01T03:00:00.123455Z");
        await movement(tags[2].id, "-20.00", endDate);
        expect(
          (await client.objectives.progress.query({ month: "2026-10" })).find(
            (row) => row.id === fixedId,
          ),
        ).toMatchObject({
          spent: "3.00",
          tracking: { start: startDate, end: endDate },
        });
        expect(
          (await client.objectives.budget.query({ id: fixedId })).effective,
        ).toMatchObject({ startDate, endDate });
      } finally {
        await api.app.close();
        await f.db.close();
      }
    });
  },
);
