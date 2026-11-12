import { createHash } from "node:crypto";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { McpAuthorizationService } from "../../../src/mcp/authorization/mcp-authorization.service";
import {
  oauthAppFixture,
  oauthTokensSchema,
} from "../../fixtures/mcp/oauth-app";
import { integration } from "../../fixtures/persistence";

describe.skipIf(!integration)(
  "external OAuth negative, replay and ownership cases",
  () => {
    it("keeps concurrent clients isolated when ordinary JSON-RPC request IDs collide", async () => {
      const f = await oauthAppFixture();
      try {
        const a = await f.authorize(),
          b = await f.authorize(f.otherToken, a.clientId);
        const expected = [
          [a.access_token, f.accountId],
          [b.access_token, f.otherAccountId],
        ] as const;
        const responses = await Promise.all(
          Array.from({ length: 4 }, () =>
            expected.map(async ([token, accountId]) => {
              // Every request deliberately carries JSON-RPC id 1 through the same
              // transport adapter, but receives its own server/transport instance.
              const response = await f
                .mcp(token, "tools/call", {
                  name: "get_account_balances",
                  arguments: {},
                })
                .expect(200);
              expect(response.body.id).toBe(1);
              expect(response.body.result.structuredContent.accounts).toEqual([
                expect.objectContaining({ id: accountId }),
              ]);
            }),
          ).flat(),
        );
        expect(responses).toHaveLength(8);
      } finally {
        await f.close();
      }
    });
    it("separates application identity from MCP grants on every protected HTTP method", async () => {
      const f = await oauthAppFixture();
      try {
        const granted = await f.authorize();
        for (const verb of ["get", "post", "delete"] as const) {
          for (const token of [
            undefined,
            f.token,
            "invalid-external-credential",
          ]) {
            const call = request(f.api.app.getHttpServer())[verb]("/mcp");
            if (token) call.set("Authorization", `Bearer ${token}`);
            const response = await call.expect(401);
            expect(response.headers["www-authenticate"]).toContain(
              "resource_metadata=",
            );
          }
        }
        await expect(
          f.api.client(granted.access_token).accounts.list.query(),
        ).rejects.toMatchObject({ data: { code: "UNAUTHORIZED" } });
        await f.mcp(granted.access_token, "tools/list").expect(200);
      } finally {
        await f.close();
      }
    });

    it("binds explicit consent to its browser and rejects foreign bodies, origins and denial replay", async () => {
      const f = await oauthAppFixture();
      try {
        const client = await f.register(),
          pending = await f.begin(client.client_id);
        await f
          .browser()
          .get(`/oauth/interaction/${pending.id}/details`)
          .set("Authorization", `Bearer ${f.token}`)
          .expect(400);
        await pending.agent
          .post(`/oauth/interaction/${pending.id}/decision`)
          .set("Authorization", `Bearer ${f.token}`)
          .set("Origin", "https://evil.example")
          .send({ approve: true })
          .expect(400);
        await pending.agent
          .post(`/oauth/interaction/${pending.id}/decision`)
          .set("Authorization", `Bearer ${f.token}`)
          .set("Origin", f.uiOrigin)
          .send({ approve: true, userId: f.otherUserId })
          .expect(400);
        const denied = await pending.agent
          .post(`/oauth/interaction/${pending.id}/decision`)
          .set("Authorization", `Bearer ${f.token}`)
          .set("Origin", f.uiOrigin)
          .send({ approve: false })
          .expect(201);
        const resume = new URL(
          z.object({ redirectTo: z.string() }).parse(denied.body).redirectTo,
        );
        const result = await pending.agent.get(resume.pathname).expect(303);
        const target = new URL(
          z.string().parse(result.headers.location),
          f.origin,
        );
        expect(target.searchParams.get("error")).toBe("access_denied");
        expect(target.searchParams.get("iss")).toBe(f.origin);
        await pending.agent
          .post(`/oauth/interaction/${pending.id}/decision`)
          .set("Authorization", `Bearer ${f.token}`)
          .set("Origin", f.uiOrigin)
          .send({ approve: true })
          .expect(400);
        expect(await f.api.client().mcpAccess.grants.query()).toEqual([]);
      } finally {
        await f.close();
      }
    });

    it("rejects resource, callback and PKCE mismatches without silently accepting weaker flows", async () => {
      const f = await oauthAppFixture();
      try {
        const client = await f.register();
        const verifier = "v".repeat(43),
          challenge = createHash("sha256").update(verifier).digest("base64url");
        for (const override of [
          { resource: "https://other.example/mcp" },
          { resource: "" },
          { redirect_uri: "https://evil.example/callback" },
          { code_challenge_method: "plain" },
          { code_challenge: "", code_challenge_method: "" },
        ]) {
          const result = await request(f.api.app.getHttpServer())
            .get("/oauth/authorize")
            .query({
              client_id: client.client_id,
              response_type: "code",
              redirect_uri: f.callback,
              scope: "finance:read",
              resource: f.resource,
              code_challenge: challenge,
              code_challenge_method: "S256",
              ...override,
            });
          expect([400, 303]).toContain(result.status);
          if (result.status === 303) {
            const target = new URL(
              z.string().parse(result.headers.location),
              f.origin,
            );
            expect(`${target.origin}${target.pathname}`).toBe(f.callback);
            expect(target.searchParams.has("error")).toBe(true);
            expect(target.searchParams.has("code")).toBe(false);
          }
        }
        const pending = await f.begin(client.client_id),
          approved = await f.approve(pending);
        await f
          .exchange(client.client_id, approved.code, "x".repeat(43))
          .expect(400);
        await request(f.api.app.getHttpServer())
          .post("/oauth/token")
          .type("form")
          .send({
            grant_type: "authorization_code",
            client_id: client.client_id,
            code: approved.code,
            code_verifier: pending.verifier,
            redirect_uri: f.callback,
            resource: "https://other.example/mcp",
          })
          .expect(400);
        await f
          .exchange(client.client_id, approved.code, pending.verifier)
          .expect(200);
      } finally {
        await f.close();
      }
    });

    it("rotates refresh credentials, supports recovery after access expiry and revokes the family on reuse", async () => {
      const f = await oauthAppFixture();
      try {
        const access = await f.authorize(),
          refresh = z.string().parse(access.refresh_token);
        const grant = (await f.api.client().mcpAccess.grants.query())[0];
        await f.db.pool.query(
          "UPDATE identity.mcp_artifact SET expires_at = clock_timestamp() - interval '1 second' WHERE model = 'AccessToken' AND grant_id = $1",
          [grant.id],
        );
        await f.mcp(access.access_token, "tools/list").expect(401);
        const renewed = oauthTokensSchema.parse(
          (await f.refresh(access.clientId, refresh).expect(200)).body,
        );
        expect(renewed.refresh_token).not.toBe(refresh);
        await f.mcp(renewed.access_token, "tools/list").expect(200);
        const reused = await f.refresh(access.clientId, refresh).expect(400);
        expect(reused.body.error).toBe("invalid_grant");
        await f.mcp(renewed.access_token, "tools/list").expect(401);
        expect(
          (await f.api.client().mcpAccess.grants.query())[0].revokedAt,
        ).not.toBeNull();
      } finally {
        await f.close();
      }
    });

    it("rejects expired, wrong-audience, unbound, foreign-owner and insufficient-scope credentials", async () => {
      const f = await oauthAppFixture();
      try {
        const access = await f.authorize(),
          grant = (await f.api.client().mcpAccess.grants.query())[0];
        const provider = f.api.app.get(McpAuthorizationService).server(),
          client = await provider.Client.find(access.clientId);
        if (!client) throw new Error("Missing registered fixture client");
        for (const [properties, status] of [
          [{ aud: "https://other.example/mcp" }, 401],
          [{ grantId: "unbound-grant" }, 401],
          [{ accountId: f.otherUserId }, 401],
          [{ scope: "openid" }, 403],
        ] as const) {
          const base = {
            client,
            accountId: f.userId,
            grantId: grant.id,
            scope: "finance:read",
            aud: f.resource,
            gty: "authorization_code",
          };
          const token = await new provider.AccessToken({
            ...base,
            ...properties,
          }).save();
          for (const verb of ["get", "post", "delete"] as const) {
            const rejected = await request(f.api.app.getHttpServer())
              [verb]("/mcp")
              .set("Authorization", `Bearer ${token}`)
              .expect(status);
            if (status === 403)
              expect(rejected.headers["www-authenticate"]).toContain(
                'error="insufficient_scope"',
              );
          }
        }
        await f
          .mcp(access.access_token, "tools/list")
          .set("Origin", "https://evil.example")
          .expect(403);
        await f
          .mcp(access.access_token, "tools/list")
          .set("Origin", new URL(f.callback).origin)
          .expect(200);
      } finally {
        await f.close();
      }
    });

    it("preserves two owners with the same client and rejects cross-owner revocation", async () => {
      const f = await oauthAppFixture();
      try {
        const a = await f.authorize(),
          b = await f.authorize(f.otherToken, a.clientId);
        for (const [token, accountId] of [
          [a.access_token, f.accountId],
          [b.access_token, f.otherAccountId],
        ]) {
          const result = await f
            .mcp(token, "tools/call", {
              name: "get_account_balances",
              arguments: { userId: "ignored-owner" },
            })
            .expect(200);
          expect(result.body.result.structuredContent.accounts).toEqual([
            expect.objectContaining({ id: accountId }),
          ]);
        }
        const aGrant = (await f.api.client().mcpAccess.grants.query())[0],
          bGrant = (
            await f.api.client(f.otherToken).mcpAccess.grants.query()
          )[0];
        await expect(
          f.api.client(f.otherToken).mcpAccess.revoke.mutate({ id: aGrant.id }),
        ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
        await f.api.client().mcpAccess.revoke.mutate({ id: aGrant.id });
        await f.mcp(a.access_token, "tools/list").expect(401);
        await f.mcp(b.access_token, "tools/list").expect(200);
        expect(bGrant.revokedAt).toBeNull();
      } finally {
        await f.close();
      }
    });

    it("consumes authorization codes atomically and does not restore a revoked family after concurrent replay", async () => {
      const f = await oauthAppFixture();
      try {
        const client = await f.register(),
          pending = await f.begin(client.client_id),
          approved = await f.approve(pending);
        const results = await Promise.all([
          f.exchange(client.client_id, approved.code, pending.verifier),
          f.exchange(client.client_id, approved.code, pending.verifier),
        ]);
        expect(
          results.filter((response) => response.status === 200).length,
        ).toBeLessThanOrEqual(1);
        expect(results.some((response) => response.status === 400)).toBe(true);
        for (const response of results.filter(
          (response) => response.status === 200,
        ))
          await f
            .mcp(
              oauthTokensSchema.parse(response.body).access_token,
              "tools/list",
            )
            .expect(401);
      } finally {
        await f.close();
      }
    });
  },
);
