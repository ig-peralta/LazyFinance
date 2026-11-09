import { createHash, generateKeyPairSync, randomBytes } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import {
  McpConsentResultSchema,
  McpConsentSchema,
} from "@lazyfinance/contracts";
import request from "supertest";
import { z } from "zod";
import { testEnvironment } from "../environment";
import { type Fixture, fixture, startApi } from "../persistence";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
export const fixtureOAuthJwks = JSON.stringify({
  keys: [
    {
      ...privateKey.export({ format: "jwk" }),
      kid: "fixture-oauth",
      alg: "RS256",
      use: "sig",
    },
  ],
});

export const oauthTokensSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string().optional(),
  token_type: z.literal("Bearer"),
  expires_in: z.number(),
});

/** Reserves a non-default candidate; a bind race fails rather than touching any listener. */
async function loopbackPort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing verification port");
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}

export async function oauthAppFixture(oauthFetch?: typeof fetch) {
  return startOAuthApi(await fixture(true), oauthFetch);
}

export async function startOAuthApi(f: Fixture, oauthFetch?: typeof fetch) {
  const port = await loopbackPort();
  const origin = `http://127.0.0.1:${port}`,
    uiOrigin = "http://127.0.0.1:43377";
  f.environment = testEnvironment({
    MCP_OAUTH_ISSUER: origin,
    MCP_OAUTH_UI_ORIGIN: uiOrigin,
    MCP_OAUTH_STATE_KEY: randomBytes(32).toString("hex"),
    MCP_OAUTH_JWKS: fixtureOAuthJwks,
  });
  let api = await startApi(f, true, undefined, port, oauthFetch).catch(
    async (error: unknown) => {
      await f.db.close();
      throw error;
    },
  );
  const resource = `${origin}/mcp`,
    callback = "http://127.0.0.1:43379/callback";
  const browser = () => request.agent(api.app.getHttpServer());
  const register = async (metadata: Record<string, unknown> = {}) => {
    const response = await request(api.app.getHttpServer())
      .post("/oauth/register")
      .send({
        client_name: "Protocol reference fixture",
        redirect_uris: [callback],
        application_type: "native",
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        ...metadata,
      })
      .expect(201);
    return z
      .object({ client_id: z.string(), client_secret: z.string().optional() })
      .parse(response.body);
  };
  type Browser = ReturnType<typeof browser>;
  const begin = async (
    clientId: string,
    agent: Browser = browser(),
    overrides: Record<string, string> = {},
  ) => {
    const verifier = randomBytes(32).toString("base64url"),
      challenge = createHash("sha256").update(verifier).digest("base64url");
    const response = await agent
      .get("/oauth/authorize")
      .query({
        client_id: clientId,
        response_type: "code",
        redirect_uri: callback,
        scope: "finance:read offline_access",
        resource,
        state: "fixture-state",
        code_challenge: challenge,
        code_challenge_method: "S256",
        ...overrides,
      })
      .expect(303);
    const location = z.string().parse(response.headers.location),
      id = location.split("/").at(-1);
    if (!id) throw new Error("Missing interaction identifier");
    return {
      agent,
      id,
      verifier,
      location,
      redirectUri: overrides.redirect_uri ?? callback,
    };
  };
  const approve = async (
    pending: Pick<Awaited<ReturnType<typeof begin>>, "agent" | "id"> & {
      redirectUri?: string;
    },
    token = f.token,
    scopes: string[] = [],
  ) => {
    const response = await pending.agent
      .post(`/oauth/interaction/${pending.id}/decision`)
      .set("Origin", uiOrigin)
      .set("Authorization", `Bearer ${token}`)
      .send({ approve: true, ...(scopes.length ? { scopes } : {}) })
      .expect(201);
    const { redirectTo } = McpConsentResultSchema.parse(response.body);
    const resumed = await pending.agent
      .get(new URL(redirectTo).pathname)
      .expect(303);
    const url = new URL(z.string().parse(resumed.headers.location), origin);
    if (`${url.origin}${url.pathname}` !== (pending.redirectUri ?? callback))
      throw new Error(
        `Authorization did not reach the callback: ${url.pathname}`,
      );
    return z
      .object({
        code: z.string(),
        state: z.literal("fixture-state"),
        iss: z.literal(origin),
      })
      .parse(Object.fromEntries(url.searchParams));
  };
  const exchange = (
    clientId: string,
    code: string,
    verifier: string,
    overrides: Record<string, string> = {},
  ) =>
    request(api.app.getHttpServer())
      .post("/oauth/token")
      .type("form")
      .send({
        grant_type: "authorization_code",
        client_id: clientId,
        code,
        code_verifier: verifier,
        redirect_uri: callback,
        resource,
        ...overrides,
      });
  const authorize = async (token = f.token, clientId?: string) => {
    const client = clientId ?? (await register()).client_id,
      pending = await begin(client);
    const approved = await approve(pending, token),
      response = await exchange(client, approved.code, pending.verifier).expect(
        200,
      );
    return { clientId: client, ...oauthTokensSchema.parse(response.body) };
  };
  return {
    ...f,
    get api() {
      return api;
    },
    origin,
    uiOrigin,
    resource,
    callback,
    browser,
    register,
    begin,
    approve,
    exchange,
    authorize,
    restart: async () => {
      await api.app.close();
      api = await startApi(f, true, undefined, port, oauthFetch);
    },
    refresh: (clientId: string, refreshToken: string) =>
      request(api.app.getHttpServer()).post("/oauth/token").type("form").send({
        grant_type: "refresh_token",
        client_id: clientId,
        refresh_token: refreshToken,
        resource,
      }),
    mcp: (token: string, method: string, params?: object) =>
      request(api.app.getHttpServer())
        .post("/mcp")
        .set("Authorization", `Bearer ${token}`)
        .set("Accept", "application/json, text/event-stream")
        .send({ jsonrpc: "2.0", id: 1, method, ...(params ? { params } : {}) }),
    preview: async (
      pending: Awaited<ReturnType<typeof begin>>,
      token = f.token,
    ) => {
      const response = await pending.agent
        .get(`/oauth/interaction/${pending.id}/details`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      return McpConsentSchema.parse(response.body);
    },
    close: async () => {
      await api.app.close();
      await f.db.close();
    },
  };
}
