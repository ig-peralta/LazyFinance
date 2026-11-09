import { generateKeyPairSync, randomUUID } from "node:crypto";
import { createPrivateKeyJwtAuth } from "@modelcontextprotocol/client";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  oauthAppFixture,
  oauthTokensSchema,
} from "../../fixtures/mcp/oauth-app";
import { integration } from "../../fixtures/persistence";

describe.skipIf(!integration)(
  "standard client-registration and authentication profiles",
  () => {
    it("rejects inconsistent CIMD identities and unsafe redirects without starting browser consent", async () => {
      const id = "https://client.example/invalid-client.json";
      for (const metadata of [
        {
          client_id: "https://other.example/client.json",
          redirect_uris: ["http://127.0.0.1/callback"],
        },
        { client_id: id, redirect_uris: ["http://unsafe.example/callback"] },
        {
          client_id: id,
          redirect_uris: ["https://client.example/callback#fragment"],
        },
      ]) {
        const f = await oauthAppFixture(async () =>
          Response.json({
            application_type: "native",
            grant_types: ["authorization_code"],
            response_types: ["code"],
            token_endpoint_auth_method: "none",
            ...metadata,
          }),
        );
        try {
          const response = await request(f.api.app.getHttpServer())
            .get("/oauth/authorize")
            .query({
              client_id: id,
              response_type: "code",
              redirect_uri: f.callback,
              resource: f.resource,
              scope: "finance:read",
              code_challenge: "c".repeat(43),
              code_challenge_method: "S256",
            });
          expect(response.status).toBe(400);
          expect(response.headers.location).toBeUndefined();
          expect(await f.api.client().mcpAccess.grants.query()).toEqual([]);
        } finally {
          await f.close();
        }
      }
    });
    it("accepts public CIMD clients with native variable-port callbacks, without dynamic registration", async () => {
      const id = "https://client.example/native-client.json";
      const fetchMetadata = vi.fn<typeof globalThis.fetch>(
        async (url, options) => {
          expect(String(url)).toBe(id);
          expect(options?.signal).toBeDefined();
          expect(Object.hasOwn(options ?? {}, "dispatcher")).toBe(true);
          return Response.json({
            client_id: id,
            client_name: "Native CIMD fixture",
            application_type: "native",
            redirect_uris: [
              "http://127.0.0.1/callback",
              "http://localhost/callback",
            ],
            grant_types: ["authorization_code", "refresh_token"],
            response_types: ["code"],
            token_endpoint_auth_method: "none",
          });
        },
      );
      const f = await oauthAppFixture(fetchMetadata);
      try {
        for (const redirect of [
          f.callback,
          "http://localhost:43379/callback",
        ]) {
          const pending = await f.begin(id, f.browser(), {
            redirect_uri: redirect,
          });
          const approved = await f.approve(pending);
          const token = oauthTokensSchema.parse(
            (
              await f
                .exchange(id, approved.code, pending.verifier, {
                  redirect_uri: redirect,
                })
                .expect(200)
            ).body,
          );
          await f.mcp(token.access_token, "tools/list").expect(200);
        }
        expect(fetchMetadata).toHaveBeenCalled();
        expect(
          (await f.api.client().mcpAccess.grants.query()).every(
            (grant) => grant.clientId === id,
          ),
        ).toBe(true);
      } finally {
        await f.close();
      }
    });

    it.each([
      "client_secret_basic",
      "client_secret_post",
    ] as const)("supports confidential %s clients without allowing missing secrets or missing PKCE", async (method) => {
      const f = await oauthAppFixture();
      try {
        const client = await f.register({ token_endpoint_auth_method: method }),
          secret = z.string().parse(client.client_secret);
        const pending = await f.begin(client.client_id),
          approved = await f.approve(pending);
        await f
          .exchange(client.client_id, approved.code, pending.verifier)
          .expect(401);
        const tokenRequest = f.exchange(
          client.client_id,
          approved.code,
          pending.verifier,
          method === "client_secret_post" ? { client_secret: secret } : {},
        );
        if (method === "client_secret_basic")
          tokenRequest.auth(client.client_id, secret);
        const token = oauthTokensSchema.parse(
          (await tokenRequest.expect(200)).body,
        );
        await f.mcp(token.access_token, "tools/list").expect(200);
        const rows = await f.db.pool.query<{ ciphertext: string }>(
          "SELECT ciphertext FROM identity.mcp_artifact WHERE model = 'Client' AND client_id = $1",
          [client.client_id],
        );
        expect(rows.rows).toHaveLength(1);
        expect(rows.rows[0].ciphertext).not.toContain(secret);
      } finally {
        await f.close();
      }
    });

    it("supports confidential CIMD private_key_jwt with bounded JWKS fetches and rejects assertion replay", async () => {
      const id = "https://client.example/confidential-client.json",
        jwks = "https://client.example/jwks.json";
      const { privateKey, publicKey } = generateKeyPairSync("rsa", {
        modulusLength: 2048,
      });
      const fetchMetadata: typeof globalThis.fetch = async (url, options) => {
        expect(Object.hasOwn(options ?? {}, "dispatcher")).toBe(true);
        if (String(url) === id)
          return Response.json({
            client_id: id,
            client_name: "Confidential CIMD fixture",
            redirect_uris: ["http://127.0.0.1/callback"],
            application_type: "native",
            grant_types: ["authorization_code", "refresh_token"],
            response_types: ["code"],
            token_endpoint_auth_method: "private_key_jwt",
            token_endpoint_auth_methods_supported: ["none", "private_key_jwt"],
            token_endpoint_auth_signing_alg: "RS256",
            jwks_uri: jwks,
          });
        if (String(url) === jwks)
          return Response.json({
            keys: [
              {
                ...publicKey.export({ format: "jwk" }),
                kid: "fixture-client",
                use: "sig",
                alg: "RS256",
              },
            ],
          });
        throw new Error("Unexpected OAuth metadata request");
      };
      const f = await oauthAppFixture(fetchMetadata);
      try {
        const pending = await f.begin(id),
          approved = await f.approve(pending);
        const headers = new Headers(),
          params = new URLSearchParams({
            grant_type: "authorization_code",
            client_id: id,
            code: approved.code,
            code_verifier: pending.verifier,
            redirect_uri: f.callback,
            resource: f.resource,
          });
        const clientAuthentication = createPrivateKeyJwtAuth({
          issuer: id,
          subject: id,
          privateKey: privateKey
            .export({ format: "pem", type: "pkcs8" })
            .toString(),
          alg: "RS256",
          audience: `${f.origin}/oauth/token`,
          claims: { jti: randomUUID() },
        });
        await clientAuthentication(headers, params, `${f.origin}/oauth/token`);
        const response = await request(f.api.app.getHttpServer())
          .post("/oauth/token")
          .type("form")
          .send(params.toString())
          .expect(200);
        await f
          .mcp(
            oauthTokensSchema.parse(response.body).access_token,
            "tools/list",
          )
          .expect(200);
        await request(f.api.app.getHttpServer())
          .post("/oauth/token")
          .type("form")
          .send(params.toString())
          .expect(401);
      } finally {
        await f.close();
      }
    });
  },
);
