import { describe, expect, it } from "vitest";
import { fixture, integration, startApi } from "../../fixtures/persistence";

describe.skipIf(!integration)(
  "owned revisioned savings-goal management",
  () => {
    it("retains legacy/seeded target definitions on their first edit or archival", async () => {
      const f = await fixture(true),
        api = await startApi(f);
      try {
        const client = api.client();
        const tag = await client.tags.create.mutate({ name: "Legacy goal" });
        for (const action of ["edit", "archive"]) {
          const row = await f.db.insert("objective", {
            userId: f.userId,
            name: "Seeded goal",
            amount: "100.00",
            kind: "amount_based",
            intent: "saving",
          });
          await f.db.insert("objective_tag", {
            objectiveId: row.id,
            tagId: tag.id,
          });
          if (action === "edit")
            await client.objectives.updateSavingsGoal.mutate({
              id: row.id,
              expectedVersion: 1,
              goal: {
                name: "Changed",
                amount: "200.00",
                tagIds: [tag.id],
                schedule: { period: "lifetime" },
              },
            });
          else
            await client.objectives.archiveSavingsGoal.mutate({
              id: row.id,
              expectedVersion: 1,
            });
          expect(
            (await client.objectives.savingsGoalHistory.query({ id: row.id }))
              .items,
          ).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                version: 1,
                name: "Seeded goal",
                amount: "100.00",
                tags: [{ id: tag.id, name: "Legacy goal", color: null }],
              }),
            ]),
          );
        }
      } finally {
        await api.app.close();
        await f.db.close();
      }
    });
    it("creates, edits with version checks, pages history and archives without changing bank facts", async () => {
      const f = await fixture(true),
        api = await startApi(f);
      try {
        const client = api.client(),
          other = api.client(f.otherToken);
        const tag = await client.tags.create.mutate({ name: "Savings" });
        const foreign = await other.tags.create.mutate({ name: "Foreign" });
        const input = {
          name: "Emergency",
          amount: "1000",
          tagIds: [tag.id],
          schedule: { period: "lifetime" as const },
        };
        await expect(
          client.objectives.createSavingsGoal.mutate({
            ...input,
            tagIds: [foreign.id],
          }),
        ).rejects.toMatchObject({ data: { code: "BAD_REQUEST" } });
        const created = await client.objectives.createSavingsGoal.mutate(input);
        expect(created).toMatchObject({
          version: 1,
          intent: "saving",
          amount: "1000.00",
          startDate: null,
          archivedAt: null,
          tags: [{ id: tag.id }],
        });
        for (const work of [
          () => other.objectives.savingsGoal.query({ id: created.id }),
          () => other.objectives.savingsGoalHistory.query({ id: created.id }),
          () =>
            other.objectives.archiveSavingsGoal.mutate({
              id: created.id,
              expectedVersion: 1,
            }),
        ])
          await expect(work()).rejects.toMatchObject({
            data: { code: "NOT_FOUND" },
          });
        const edits = await Promise.allSettled(
          ["1200", "1500"].map((amount) =>
            client.objectives.updateSavingsGoal.mutate({
              id: created.id,
              expectedVersion: 1,
              goal: { ...input, amount },
            }),
          ),
        );
        expect(
          edits.filter((result) => result.status === "fulfilled"),
        ).toHaveLength(1);
        expect(
          edits.find((result) => result.status === "rejected"),
        ).toMatchObject({ reason: { data: { code: "CONFLICT" } } });
        const page = await client.objectives.savingsGoalHistory.query({
          id: created.id,
          limit: 1,
        });
        expect(page.items[0].version).toBe(2);
        if (!page.pageInfo.nextCursor)
          throw new Error("Expected revision continuation");
        const previous = await client.objectives.savingsGoalHistory.query({
          id: created.id,
          cursor: page.pageInfo.nextCursor,
          limit: 1,
        });
        expect(previous.items[0]).toMatchObject({
          version: 1,
          amount: "1000.00",
          tags: [{ id: tag.id }],
        });
        const another = await client.objectives.createSavingsGoal.mutate({
          ...input,
          name: "Other",
        });
        await expect(
          client.objectives.savingsGoalHistory.query({
            id: another.id,
            cursor: page.pageInfo.nextCursor,
          }),
        ).rejects.toMatchObject({ data: { code: "BAD_REQUEST" } });
        const archived = await client.objectives.archiveSavingsGoal.mutate({
          id: created.id,
          expectedVersion: 2,
        });
        expect(archived).toMatchObject({
          version: 3,
          archivedAt: expect.any(String),
        });
        expect(
          await client.objectives.archiveSavingsGoal.mutate({
            id: created.id,
            expectedVersion: 2,
          }),
        ).toEqual(archived);
        expect(
          (await client.objectives.list.query()).some(
            (goal) => goal.id === created.id,
          ),
        ).toBe(false);
        expect(
          (await client.objectives.savingsGoalHistory.query({ id: created.id }))
            .items,
        ).toHaveLength(2);
        await expect(
          client.objectives.updateSavingsGoal.mutate({
            id: created.id,
            expectedVersion: 3,
            goal: input,
          }),
        ).rejects.toMatchObject({ data: { code: "BAD_REQUEST" } });
        expect(
          (await f.db.rows("account", { id: f.accountId }))[0].balance,
        ).toBe("500000.00");
      } finally {
        await api.app.close();
        await f.db.close();
      }
    });
  },
);
