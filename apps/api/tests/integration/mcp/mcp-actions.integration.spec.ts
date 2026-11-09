import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ActionsService } from "../../../src/actions/actions.service";
import { PersistenceClient } from "../../../src/persistence/persistence.client";
import { oauthAppFixture } from "../../fixtures/mcp/oauth-app";
import { integration } from "../../fixtures/persistence";

async function authorized(
  f: Awaited<ReturnType<typeof oauthAppFixture>>,
  scopes: string[],
  selected = scopes,
) {
  const client = await f.register();
  const pending = await f.begin(client.client_id, f.browser(), {
    scope: ["finance:read", ...scopes].join(" "),
  });
  const approved = await f.approve(pending, f.token, selected);
  const token = await f
    .exchange(client.client_id, approved.code, pending.verifier)
    .expect(200);
  return {
    token: String(token.body.access_token),
    clientId: client.client_id,
    scope: String(token.body.scope ?? ""),
  };
}

describe.skipIf(!integration)(
  "explicit MCP write delegation without chat approval",
  () => {
    it("keeps read-only grants read-only and refuses forged approvals or ungranted write tools", async () => {
      const f = await oauthAppFixture();
      try {
        const auth = await f.authorize();
        const input = {
          requestId: randomUUID(),
          action: { kind: "create_tag", tag: { name: "Do not create" } },
        };
        const denied = await f
          .mcp(auth.access_token, "tools/call", {
            name: "ejecutar_accion_financiera",
            arguments: input,
          })
          .expect(200);
        expect(denied.body.result.isError).toBe(true);
        expect(await f.api.client().tags.list.query()).toEqual([]);
        const grants = await f.api.client().mcpAccess.grants.query();
        expect(grants[0].scopes).toEqual(
          expect.arrayContaining(["finance:read"]),
        );
        expect(
          grants[0].scopes.some(
            (scope) => scope.endsWith(":write") || scope.endsWith(":tag"),
          ),
        ).toBe(false);
        await expect(
          f.api.app
            .get(ActionsService)
            .execute(f.userId, grants[0].id, auth.clientId, input),
        ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
      } finally {
        await f.close();
      }
    });

    it("grants only selected capabilities and executes directly once with a durable, grant-bound receipt", async () => {
      const f = await oauthAppFixture();
      try {
        const auth = await authorized(
          f,
          ["finance:tags:write", "finance:budgets:write"],
          ["finance:tags:write"],
        );
        const grant = (await f.api.client().mcpAccess.grants.query())[0];
        expect(grant.scopes).toContain("finance:tags:write");
        expect(grant.scopes).not.toContain("finance:budgets:write");
        const input = {
          requestId: randomUUID(),
          action: {
            kind: "create_tag" as const,
            tag: { name: "MCP approved capability" },
          },
        };
        const first = await f
          .mcp(auth.token, "tools/call", {
            name: "ejecutar_accion_financiera",
            arguments: input,
          })
          .expect(200);
        expect(first.body.result.isError).not.toBe(true);
        const receipt = first.body.result.structuredContent;
        expect(receipt).toMatchObject({
          origin: "mcp",
          status: "applied",
          conversationId: null,
          results: [{ title: "MCP approved capability", outcome: "created" }],
        });
        const replay = await f
          .mcp(auth.token, "tools/call", {
            name: "ejecutar_accion_financiera",
            arguments: input,
          })
          .expect(200);
        expect(replay.body.result.structuredContent).toEqual(receipt);
        const privateActions = f.api.app
          .get(PersistenceClient)
          .user(f.userId).financialActions;
        expect(
          await privateActions.execute.mutate({
            input,
            command: null,
            grantId: grant.id,
            clientId: auth.clientId,
          }),
        ).toEqual(receipt);
        await expect(
          privateActions.execute.mutate({
            input: { ...input, requestId: randomUUID() },
            command: null,
            grantId: grant.id,
            clientId: auth.clientId,
          }),
        ).rejects.toMatchObject({ data: { code: "BAD_REQUEST" } });
        expect(await f.api.client().tags.list.query()).toHaveLength(1);
        const changed = await f
          .mcp(auth.token, "tools/call", {
            name: "ejecutar_accion_financiera",
            arguments: {
              ...input,
              action: {
                kind: "create_tag",
                tag: { name: "A different intent" },
              },
            },
          })
          .expect(200);
        expect(changed.body.result.isError).toBe(true);
        expect(await f.api.client().assistant.conversations.query()).toEqual(
          [],
        );
        await f.api.client().mcpAccess.revoke.mutate({ id: grant.id });
        await f.mcp(auth.token, "tools/list").expect(401);
        expect(
          (await f.api.client().financialActions.get.query({ id: receipt.id }))
            .status,
        ).toBe("applied");
      } finally {
        await f.close();
      }
    });

    it("does not silently grant requested writes when the person approves only reading", async () => {
      const f = await oauthAppFixture();
      try {
        const auth = await authorized(f, ["finance:tags:write"], []);
        const result = await f
          .mcp(auth.token, "tools/call", {
            name: "ejecutar_accion_financiera",
            arguments: {
              requestId: randomUUID(),
              action: { kind: "create_tag", tag: { name: "Not delegated" } },
            },
          })
          .expect(200);
        expect(result.body.result.isError).toBe(true);
        expect(
          (await f.api.client().mcpAccess.grants.query())[0].scopes,
        ).toEqual(["finance:read"]);
        expect(await f.api.client().tags.list.query()).toEqual([]);
      } finally {
        await f.close();
      }
    });

    it("pins existing-record changes to a preview and refuses foreign targets, stale selections and missing dependent permissions", async () => {
      const f = await oauthAppFixture();
      try {
        const auth = await authorized(f, ["finance:tags:write"]);
        const own = f.api.client(),
          tag = await own.tags.create.mutate({ name: "MCP original" });
        const action = {
          kind: "update_tag",
          tag: { id: tag.id, name: "MCP edit" },
        };
        const preview = await f
          .mcp(auth.token, "tools/call", {
            name: "previsualizar_accion_financiera",
            arguments: { action },
          })
          .expect(200);
        const expectedFingerprint =
          preview.body.result.structuredContent.fingerprint;
        await own.tags.update.mutate({ id: tag.id, name: "Newer manual edit" });
        const stale = await f
          .mcp(auth.token, "tools/call", {
            name: "ejecutar_accion_financiera",
            arguments: { requestId: randomUUID(), action, expectedFingerprint },
          })
          .expect(200);
        expect(stale.body.result.isError).toBe(true);
        expect((await own.tags.list.query())[0].name).toBe("Newer manual edit");
        const otherTag = await f.api
          .client(f.otherToken)
          .tags.create.mutate({ name: "Other owner" });
        const foreign = await f
          .mcp(auth.token, "tools/call", {
            name: "previsualizar_accion_financiera",
            arguments: {
              action: {
                ...action,
                tag: { id: otherTag.id, name: "Do not overwrite" },
              },
            },
          })
          .expect(200);
        expect(foreign.body.result.isError).toBe(true);
        const budgetAuth = await authorized(f, ["finance:budgets:write"]);
        const denied = await f
          .mcp(budgetAuth.token, "tools/call", {
            name: "ejecutar_accion_financiera",
            arguments: {
              requestId: randomUUID(),
              action: {
                kind: "create_budget",
                budget: {
                  name: "Requires tags permission",
                  amount: "1000",
                  newTags: [{ name: "Missing permission" }],
                  schedule: {
                    period: "monthly",
                    startDate: `${new Date().toISOString().slice(0, 7)}-01`,
                  },
                },
              },
            },
          })
          .expect(200);
        expect(denied.body.result.isError).toBe(true);
        expect(await own.objectives.list.query()).toEqual([]);
      } finally {
        await f.close();
      }
    });
  },
);
