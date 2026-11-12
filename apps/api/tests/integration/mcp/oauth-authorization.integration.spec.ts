import request from "supertest";
import { describe, expect, it } from "vitest";
import { oauthAppFixture } from "../../fixtures/mcp/oauth-app";
import { integration } from "../../fixtures/persistence";

describe.skipIf(!integration)(
  "external MCP OAuth through public/private RPC and PostgreSQL",
  () => {
    it("discovers authorization metadata, obtains a scoped client grant and reads the same owned balance as public RPC", async () => {
      const f = await oauthAppFixture();
      try {
        const challenge = await request(f.api.app.getHttpServer())
          .post("/mcp")
          .send({})
          .expect(401);
        expect(challenge.headers["www-authenticate"]).toContain(
          `${f.origin}/.well-known/oauth-protected-resource/mcp`,
        );
        const metadata = await request(f.api.app.getHttpServer())
          .get("/.well-known/oauth-authorization-server")
          .expect(200);
        expect(metadata.body).toMatchObject({
          issuer: f.origin,
          client_id_metadata_document_supported: true,
          code_challenge_methods_supported: ["S256"],
          authorization_response_iss_parameter_supported: true,
        });
        const client = await f.register(),
          pending = await f.begin(client.client_id);
        expect(await f.preview(pending)).toMatchObject({
          clientId: client.client_id,
          resource: f.resource,
          scopes: expect.arrayContaining(["finance:read"]),
        });
        const approved = await f.approve(pending),
          exchanged = await f
            .exchange(client.client_id, approved.code, pending.verifier)
            .expect(200);
        const access = exchanged.body.access_token;
        expect(typeof access).toBe("string");
        const tools = await request(f.api.app.getHttpServer())
          .post("/mcp")
          .set("Authorization", `Bearer ${access}`)
          .set("Accept", "application/json, text/event-stream")
          .send({
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: { name: "get_account_balances", arguments: {} },
          })
          .expect(200);
        const accounts = await f.api.client().accounts.list.query();
        expect(tools.body.result.structuredContent.accounts).toEqual(accounts);
        expect(accounts).toHaveLength(1);
        const grants = await f.api.client().mcpAccess.grants.query();
        expect(grants).toHaveLength(1);
        expect(grants[0].redirectUri).toBe("http://127.0.0.1:43379/callback");
        expect(
          await f.api.client(f.otherToken).mcpAccess.grants.query(),
        ).toEqual([]);
        await f.api.client().mcpAccess.revoke.mutate({ id: grants[0].id });
        await request(f.api.app.getHttpServer())
          .post("/mcp")
          .set("Authorization", `Bearer ${access}`)
          .send({})
          .expect(401);
        await f.api.client().accounts.list.query();
      } finally {
        await f.close();
      }
    });
  },
);
