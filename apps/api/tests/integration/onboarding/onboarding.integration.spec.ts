import { describe, expect, it } from "vitest";
import { fixture, integration, startApi } from "../../fixtures/persistence";

describe.skipIf(!integration)(
  "account onboarding through both RPC boundaries",
  () => {
    it("remembers skip/completion across clients, stays terminal and never requires financial setup", async () => {
      const f = await fixture(),
        api = await startApi(f);
      try {
        const client = api.client(),
          other = api.client(f.otherToken);
        expect(await client.onboarding.state.query()).toEqual({
          status: "active",
          completedAt: null,
        });
        expect(
          await client.onboarding.finish.mutate({ status: "skipped" }),
        ).toEqual({ status: "skipped", completedAt: null });
        expect(await api.client().onboarding.state.query()).toEqual({
          status: "skipped",
          completedAt: null,
        });
        expect(await other.onboarding.state.query()).toEqual({
          status: "active",
          completedAt: null,
        });

        const completed = await client.onboarding.finish.mutate({
          status: "completed",
        });
        expect(completed).toMatchObject({
          status: "completed",
          completedAt: expect.any(String),
        });
        expect(await api.client().onboarding.state.query()).toEqual(completed);
        expect(
          await api.client().onboarding.finish.mutate({ status: "skipped" }),
        ).toEqual(completed);
        expect(
          await api.client().onboarding.finish.mutate({ status: "completed" }),
        ).toEqual(completed);
        expect(await other.onboarding.state.query()).toEqual({
          status: "active",
          completedAt: null,
        });
        for (const read of [
          client.accounts.list.query(),
          client.objectives.list.query(),
          client.income.sources.query(),
          client.tags.list.query(),
        ])
          expect(await read).toEqual([]);
        const saved = await f.db.pool.query<{
          status: string;
          completed_at: Date;
        }>(
          "select status,completed_at from identity.onboarding where user_id=$1",
          [f.userId],
        );
        expect(saved.rows[0].status).toBe("completed");
        expect(saved.rows[0].completed_at.toISOString()).toBe(
          completed.completedAt,
        );
      } finally {
        await api.app.close();
        await f.db.close();
      }
    });

    it("requires authentication and rejects owner/timestamp injection or reset attempts", async () => {
      const f = await fixture(),
        api = await startApi(f);
      try {
        expect((await fetch(`${api.url}/trpc/onboarding.state`)).status).toBe(
          401,
        );
        const injectedRead = await fetch(
          `${api.url}/trpc/onboarding.state?input=${encodeURIComponent(JSON.stringify({ userId: f.otherUserId }))}`,
          { headers: { authorization: `Bearer ${f.token}` } },
        );
        expect(injectedRead.status).toBe(400);
        for (const input of [
          { status: "active" },
          { status: "completed", userId: f.otherUserId },
          { status: "completed", completedAt: "2020-01-01T00:00:00.000Z" },
          { completed: true },
        ]) {
          const response = await fetch(`${api.url}/trpc/onboarding.finish`, {
            method: "POST",
            headers: {
              authorization: `Bearer ${f.token}`,
              "content-type": "application/json",
            },
            body: JSON.stringify(input),
          });
          expect(response.status).toBe(400);
        }
        expect(await api.client().onboarding.state.query()).toEqual({
          status: "active",
          completedAt: null,
        });
        const rows = await f.db.pool.query(
          "select * from identity.onboarding where user_id in ($1,$2)",
          [f.userId, f.otherUserId],
        );
        expect(rows.rows).toEqual([]);
      } finally {
        await api.app.close();
        await f.db.close();
      }
    });
  },
);
