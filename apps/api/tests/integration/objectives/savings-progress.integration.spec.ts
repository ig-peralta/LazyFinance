import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { oauthAppFixture } from "../../fixtures/mcp/oauth-app";
import { fixture, integration, startApi } from "../../fixtures/persistence";

describe.skipIf(!integration)(
  "measured savings and reconciled evidence",
  () => {
    it("reconciles signed cash allocations, pending facts, overlapping goals and incomplete history without income/internal gates", async () => {
      const f = await oauthAppFixture(),
        api = f.api;
      try {
        const client = api.client(),
          other = api.client(f.otherToken);
        const tag = await client.tags.create.mutate({
          name: "Selected savings",
        });
        const otherTag = await other.tags.create.mutate({
          name: "Other savings",
        });
        const definition = {
          name: "Goal",
          amount: "200.00",
          tagIds: [tag.id],
          schedule: { period: "monthly" as const, startDate: "2026-09-01" },
        };
        const goal =
          await client.objectives.createSavingsGoal.mutate(definition);
        const overlap = await client.objectives.createSavingsGoal.mutate({
          ...definition,
          name: "Overlapping",
        });
        await f.db.update("account", f.accountId, {
          historyCompleteness: "partial",
          historyFrom: "2026-09-10",
          historyThrough: "2026-09-30",
        });
        const cash = await f.db.insert("account", {
          userId: f.userId,
          providerConnectionId: f.connectionId,
          type: "savings",
          active: false,
        });
        const card = await f.db.insert("account", {
          userId: f.userId,
          providerConnectionId: f.connectionId,
          type: "credit_card",
        });
        const movement = async (
          amount: string,
          bookedAt = "2026-09-15T15:00:00.123456Z",
          accountId: string = f.accountId,
          patch: {
            isInternalMovement?: boolean | null;
            reviewStatus?: "clear" | "needs_review";
            removedAt?: string;
            tagId?: string | null;
          } = {},
        ) =>
          f.db.insert("transaction", {
            accountId,
            tagId: tag.id,
            amount,
            type: amount.startsWith("-") ? "debit" : "credit",
            bookedAt,
            isInternalMovement: null,
            source: "provider",
            tagDecisionOrigin: "manual",
            removalReason: patch.removedAt ? "removed" : null,
            ...patch,
          });
        await movement("100.00");
        await movement("-20.00");
        await movement("-40.00", undefined, undefined, {
          isInternalMovement: true,
        });
        await movement("40.00", undefined, cash.id, {
          isInternalMovement: true,
        });
        await movement("10.00", "2026-09-01T04:00:00.000000Z");
        await movement("50.00", undefined, undefined, {
          reviewStatus: "needs_review",
        });
        await movement("1000.00", undefined, card.id);
        await movement("500.00", undefined, undefined, {
          removedAt: "2026-09-16T00:00:00Z",
        });
        await movement("500.00", undefined, undefined, { tagId: null });
        await movement("500.00", "2026-09-01T03:59:59.999999Z");
        await movement("500.00", "2026-10-01T03:00:00.000000Z");
        await movement("500.00", undefined, f.otherAccountId, {
          tagId: otherTag.id,
        });
        const input = {
          id: goal.id,
          month: "2026-09",
          asOf: "2026-09-30T23:00:00Z",
        };
        const progress = await client.objectives.savingsProgress.query(input);
        expect(progress).toMatchObject({
          contributions: "150.00",
          withdrawals: "60.00",
          netContributions: "90.00",
          remaining: "110.00",
          percentage: "45.00",
          contributionCount: 3,
          withdrawalCount: 2,
          pendingCount: 1,
          basis: "recorded_allocations",
          tracking: {
            start: "2026-09-01T04:00:00.000000Z",
            end: "2026-10-01T03:00:00.000000Z",
          },
        });
        expect(progress.historyCoverage).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              accountId: f.accountId,
              completeness: "partial",
              from: "2026-09-10",
            }),
            expect.objectContaining({
              accountId: cash.id,
              completeness: "unknown",
            }),
          ]),
        );
        expect(
          progress.historyCoverage.some(
            (row) =>
              row.accountId === f.otherAccountId || row.accountId === card.id,
          ),
        ).toBe(false);
        expect(
          (
            await client.objectives.savingsProgress.query({
              ...input,
              id: overlap.id,
            })
          ).netContributions,
        ).toBe("90.00");
        let cursor: string | undefined,
          net = 0,
          pending = 0;
        const ids: string[] = [];
        do {
          const page = await client.objectives.savingsContributions.query({
            ...input,
            cursor,
            limit: 2,
          });
          for (const item of page.items) {
            ids.push(item.id);
            if (item.effect.status === "applied")
              net += Number(item.effect.amount);
            else pending++;
          }
          cursor = page.pageInfo.nextCursor ?? undefined;
          if (cursor) {
            await expect(
              client.objectives.savingsContributions.query({
                ...input,
                id: overlap.id,
                cursor,
              }),
            ).rejects.toMatchObject({ data: { code: "BAD_REQUEST" } });
            await expect(
              client.objectives.savingsContributions.query({
                id: goal.id,
                month: input.month,
                cursor,
              }),
            ).rejects.toMatchObject({ data: { code: "BAD_REQUEST" } });
          }
        } while (cursor);
        expect(ids).toHaveLength(6);
        expect(new Set(ids).size).toBe(6);
        expect(net).toBe(90);
        expect(pending).toBe(1);
        for (const work of [
          () => other.objectives.savingsProgress.query(input),
          () => other.objectives.savingsContributions.query(input),
        ])
          await expect(work()).rejects.toMatchObject({
            data: { code: "NOT_FOUND" },
          });
        const response = await fetch(`${api.url}/mcp`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${(await f.authorize()).access_token}`,
            "content-type": "application/json",
            accept: "application/json, text/event-stream",
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: { name: "consultar_avance_ahorro", arguments: input },
          }),
        });
        expect(await response.text()).toContain('"netContributions":"90.00"');
      } finally {
        await api.app.close();
        await f.db.close();
      }
    });

    it("preserves negative observations, exact observation/archive cutoffs and current-fact corrections across schedules", async () => {
      const f = await fixture(true),
        api = await startApi(f);
      try {
        const client = api.client(),
          tag = await client.tags.create.mutate({ name: "Goal corrections" });
        const base = { name: "Goal", amount: "100.00", tagIds: [tag.id] };
        const goal = await client.objectives.createSavingsGoal.mutate({
          ...base,
          schedule: { period: "lifetime" },
        });
        const debit = await f.db.insert("transaction", {
          accountId: f.accountId,
          tagId: tag.id,
          tagDecisionOrigin: "manual",
          amount: "-30.00",
          type: "debit",
          bookedAt: "2026-01-10T15:00:00Z",
        });
        const credit = await f.db.insert("transaction", {
          accountId: f.accountId,
          tagId: tag.id,
          tagDecisionOrigin: "manual",
          amount: "10.00",
          type: "credit",
          bookedAt: "2026-09-15T15:00:00.000001Z",
        });
        const input = {
          id: goal.id,
          month: "2026-09",
          asOf: "2026-09-15T15:00:00Z",
        };
        expect(
          await client.objectives.savingsProgress.query(input),
        ).toMatchObject({
          netContributions: "-30.00",
          remaining: "130.00",
          percentage: "-30.00",
        });
        expect(
          (
            await client.objectives.savingsProgress.query({
              ...input,
              asOf: "2026-09-15T15:00:00.000001Z",
            })
          ).netContributions,
        ).toBe("-20.00");
        await f.db.update("transaction", credit.id, { amount: "20.00" });
        expect(
          (
            await client.objectives.savingsProgress.query({
              ...input,
              asOf: "2026-09-30T00:00:00Z",
            })
          ).netContributions,
        ).toBe("-10.00");
        await f.db.update("transaction", debit.id, { tagId: null });
        expect(
          (
            await client.objectives.savingsProgress.query({
              ...input,
              asOf: "2026-09-30T00:00:00Z",
            })
          ).netContributions,
        ).toBe("20.00");
        for (const [schedule, net] of [
          [{ period: "yearly", startDate: "2026-01-01" }, "20.00"],
          [
            { period: "fixed", startDate: "2026-09-01", endDate: "2026-09-14" },
            "0.00",
          ],
          [{ period: "monthly", startDate: "2026-10-01" }, "0.00"],
        ] as const) {
          const target = await client.objectives.createSavingsGoal.mutate({
            ...base,
            schedule,
          });
          expect(
            (
              await client.objectives.savingsProgress.query({
                id: target.id,
                month: "2026-09",
              })
            ).netContributions,
          ).toBe(net);
        }
        const archived = await client.objectives.archiveSavingsGoal.mutate({
          id: goal.id,
          expectedVersion: 1,
        });
        if (!archived.archivedAt) throw new Error("Missing archive cutoff");
        await f.db.insert("transaction", {
          id: randomUUID(),
          accountId: f.accountId,
          tagId: tag.id,
          tagDecisionOrigin: "manual",
          amount: "1000.00",
          type: "credit",
          bookedAt: archived.archivedAt,
        });
        expect(
          (await client.objectives.savingsProgress.query({ id: goal.id }))
            .netContributions,
        ).toBe("20.00");
        await expect(
          client.objectives.savingsProgress.query({
            ...input,
            asOf: "9999-01-01T00:00:00Z",
          }),
        ).rejects.toMatchObject({ data: { code: "BAD_REQUEST" } });
        await expect(
          f.persistence.user(f.userId).objectives.savingsFacts.query({
            id: goal.id,
            expectedVersion: 1,
            start: null,
            end: "2026-10-01 00:00:00",
            asOf: input.asOf,
          }),
        ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
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
