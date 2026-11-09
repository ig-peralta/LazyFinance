import request from "supertest";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  oauthAppFixture,
  oauthTokensSchema,
} from "../../fixtures/mcp/oauth-app";
import { integration } from "../../fixtures/persistence";

describe.skipIf(!integration)(
  "persisted OAuth lifecycle and browser protocol boundaries",
  () => {
    it("enforces client-bound RFC 7009 revocation and revokes the whole access/refresh family", async () => {
      const f = await oauthAppFixture();
      try {
        const access = await f.authorize(),
          other = await f.register();
        const rejected = await request(f.api.app.getHttpServer())
          .post("/oauth/revoke")
          .type("form")
          .send({ client_id: other.client_id, token: access.access_token });
        // RFC 7009 deliberately returns success for unknown/foreign tokens to
        // avoid turning revocation into a credential-existence oracle.
        expect(rejected.status).toBe(200);
        await f.mcp(access.access_token, "tools/list").expect(200);
        await request(f.api.app.getHttpServer())
          .post("/oauth/revoke")
          .type("form")
          .send({ client_id: access.clientId, token: access.access_token })
          .expect(200);
        await f.mcp(access.access_token, "tools/list").expect(401);
        await f
          .refresh(access.clientId, z.string().parse(access.refresh_token))
          .expect(400);
      } finally {
        await f.close();
      }
    });
    it("keeps credentials and revocation across API/provider restarts with stable OAuth-only keys", async () => {
      const f = await oauthAppFixture();
      try {
        const access = await f.authorize();
        await f.restart();
        await f.mcp(access.access_token, "tools/list").expect(200);
        const refreshed = oauthTokensSchema.parse(
          (
            await f
              .refresh(access.clientId, z.string().parse(access.refresh_token))
              .expect(200)
          ).body,
        );
        const grant = (await f.api.client().mcpAccess.grants.query())[0];
        await f.api.client().mcpAccess.revoke.mutate({ id: grant.id });
        await f.restart();
        await f.mcp(refreshed.access_token, "tools/list").expect(401);
        await f
          .refresh(access.clientId, z.string().parse(refreshed.refresh_token))
          .expect(400);
      } finally {
        await f.close();
      }
    });

    it("allows one persisted consent decision across concurrent approval/denial and owner changes", async () => {
      const f = await oauthAppFixture();
      try {
        const client = await f.register(),
          pending = await f.begin(client.client_id);
        const decisions = await Promise.all([
          pending.agent
            .post(`/oauth/interaction/${pending.id}/decision`)
            .set("Origin", f.uiOrigin)
            .set("Authorization", `Bearer ${f.token}`)
            .send({ approve: true }),
          pending.agent
            .post(`/oauth/interaction/${pending.id}/decision`)
            .set("Origin", f.uiOrigin)
            .set("Authorization", `Bearer ${f.otherToken}`)
            .send({ approve: false }),
        ]);
        expect(decisions.map((result) => result.status).sort()).toEqual([
          201, 400,
        ]);
        expect(
          (await f.api.client().mcpAccess.grants.query()).length,
        ).toBeLessThanOrEqual(1);
        expect(
          await f.api.client(f.otherToken).mcpAccess.grants.query(),
        ).toEqual([]);
      } finally {
        await f.close();
      }
    });

    it("bounds protocol bodies, preserves duplicate parameters and separates public CORS from credentialed interaction CORS", async () => {
      const f = await oauthAppFixture();
      try {
        const server = f.api.app.getHttpServer();
        await request(server)
          .get("/.well-known/oauth-authorization-server")
          .set("Host", "untrusted.example")
          .expect(421);
        const metadata = await request(server)
          .get("/.well-known/oauth-authorization-server")
          .expect(200);
        expect(metadata.body).toMatchObject({
          issuer: f.origin,
          token_endpoint: `${f.origin}/oauth/token`,
          authorization_endpoint: `${f.origin}/oauth/authorize`,
        });
        const publicCors = await request(server)
          .options("/mcp")
          .set("Origin", "https://client.example")
          .set("Access-Control-Request-Method", "POST")
          .expect(204);
        expect(publicCors.headers["access-control-allow-origin"]).toBe("*");
        expect(
          publicCors.headers["access-control-allow-credentials"],
        ).toBeUndefined();
        for (const origin of [f.uiOrigin, "https://evil.example"]) {
          const cors = await request(server)
            .options("/oauth/interaction/fixture/decision")
            .set("Origin", origin)
            .set("Access-Control-Request-Method", "POST")
            .expect(204);
          expect(cors.headers["access-control-allow-origin"]).toBe(
            origin === f.uiOrigin ? f.uiOrigin : undefined,
          );
        }
        await request(server)
          .post("/oauth/register")
          .send({ client_name: "x".repeat(60 * 1024) })
          .expect(413);
        await request(server)
          .post("/oauth/token")
          .type("form")
          .send(
            `resource=${encodeURIComponent(f.resource)}&resource=${encodeURIComponent(f.resource)}&grant_type=authorization_code`,
          )
          .expect(400);
      } finally {
        await f.close();
      }
    });

    it("revokes the family on concurrent refresh replay and enforces the immutable thirty-day grant boundary", async () => {
      const f = await oauthAppFixture();
      try {
        const access = await f.authorize(),
          refresh = z.string().parse(access.refresh_token);
        const results = await Promise.all([
          f.refresh(access.clientId, refresh),
          f.refresh(access.clientId, refresh),
        ]);
        expect(
          results.filter((result) => result.status === 200).length,
        ).toBeLessThanOrEqual(1);
        expect(results.some((result) => result.status === 400)).toBe(true);
        for (const result of results.filter((result) => result.status === 200))
          await f
            .mcp(
              oauthTokensSchema.parse(result.body).access_token,
              "tools/list",
            )
            .expect(401);
        const second = await f.authorize(),
          grants = await f.api.client().mcpAccess.grants.query(),
          grant = grants.find((row) => row.revokedAt === null);
        if (!grant) throw new Error("Missing active grant");
        await f.db.pool.query(
          "UPDATE identity.mcp_grant SET created_at = clock_timestamp() - interval '30 days', expires_at = clock_timestamp() - interval '1 second' WHERE id = $1",
          [grant.id],
        );
        await f.mcp(second.access_token, "tools/list").expect(401);
        await f
          .refresh(second.clientId, z.string().parse(second.refresh_token))
          .expect(400);
      } finally {
        await f.close();
      }
    });
  },
);
