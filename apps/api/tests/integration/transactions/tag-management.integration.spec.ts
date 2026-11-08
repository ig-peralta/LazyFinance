import { describe, expect, it } from "vitest";
import { fixture, integration, startApi } from "../../fixtures/persistence";

describe.skipIf(!integration)("owned tag lifecycle", () => {
  it("renames/recolors without changing membership, reserves names and archives only future selection", async () => {
    const f = await fixture(true),
      api = await startApi(f);
    try {
      const client = api.client(),
        other = api.client(f.otherToken);
      const tag = await client.tags.create.mutate({
        name: "  Food  ",
        color: "#112233",
      });
      expect(tag.name).toBe("Food");
      expect((await other.tags.create.mutate({ name: "Food" })).id).not.toBe(
        tag.id,
      );
      expect((await client.tags.create.mutate({ name: "Food" })).id).toBe(
        tag.id,
      );
      const duplicate = await client.tags.create.mutate({ name: "Reserved" });
      const movement = await f.db.insert("transaction", {
        accountId: f.accountId,
        amount: "-25.00",
        type: "debit",
        bookedAt: "2026-09-15T15:00:00Z",
        isInternalMovement: false,
      });
      await client.tags.decide.mutate({
        transactionId: movement.id,
        tagId: tag.id,
      });
      const goal = await client.objectives.createSavingsGoal.mutate({
        name: "Retained",
        amount: "100.00",
        tagIds: [tag.id],
        schedule: { period: "lifetime" },
      });
      const rule = await client.tagRules.create.mutate({
        tagId: tag.id,
        direction: "debit",
        matchField: "merchant",
        matchValue: "Store",
        autoApply: true,
      });
      const renamed = await client.tags.update.mutate({
        id: tag.id,
        name: "  Groceries  ",
      });
      expect(renamed).toMatchObject({
        name: "Groceries",
        color: "#112233",
        isArchived: false,
      });
      expect(
        await client.tags.update.mutate({ id: tag.id, color: null }),
      ).toMatchObject({ name: "Groceries", color: null });
      await expect(
        client.tags.update.mutate({ id: tag.id, name: duplicate.name }),
      ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
      for (const work of [
        () => other.tags.update.mutate({ id: tag.id, name: "Stolen" }),
        () => other.tags.archive.mutate({ id: tag.id }),
      ])
        await expect(work()).rejects.toMatchObject({
          data: { code: "NOT_FOUND" },
        });
      const archived = await client.tags.archive.mutate({ id: tag.id });
      expect(archived.isArchived).toBe(true);
      expect(await client.tags.archive.mutate({ id: tag.id })).toEqual(
        archived,
      );
      expect(
        (await client.tags.list.query()).some((item) => item.id === tag.id),
      ).toBe(false);
      await expect(
        client.tags.create.mutate({ name: "Groceries" }),
      ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
      await expect(
        client.tags.update.mutate({ id: tag.id, color: "#abcdef" }),
      ).rejects.toMatchObject({ data: { code: "BAD_REQUEST" } });
      await expect(
        client.tags.decide.mutate({
          transactionId: movement.id,
          tagId: tag.id,
        }),
      ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
      expect(
        (await client.objectives.savingsGoalHistory.query({ id: goal.id }))
          .items[0].tags,
      ).toMatchObject([{ id: tag.id, name: "Groceries" }]);
      expect(
        (
          await client.objectives.savingsProgress.query({
            id: goal.id,
            month: "2026-09",
          })
        ).netContributions,
      ).toBe("-25.00");
      expect(
        (await client.summaries.monthly.query({ month: "2026-09" })).tags,
      ).toMatchObject([{ id: tag.id, amount: "25.00", name: "Groceries" }]);
      expect(
        (await client.tagRules.list.query()).find(
          (item) => item.id === rule.id,
        ),
      ).toBeDefined();
      expect(
        (
          await f.persistence
            .user(f.userId)
            .tagRules.facts.query({ id: movement.id })
        ).rules.some((item) => item.id === rule.id),
      ).toBe(false);
      expect(
        (await f.db.rows("transaction", { id: movement.id }))[0],
      ).toMatchObject({
        tag_id: tag.id,
        amount: "-25.00",
        booked_at: movement.booked_at,
      });
      expect((await f.db.rows("account", { id: f.accountId }))[0].balance).toBe(
        "500000.00",
      );
    } finally {
      await api.app.close();
      await f.db.close();
    }
  });
});
