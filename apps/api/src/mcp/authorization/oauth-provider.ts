import type { Request } from "express";
import type { Configuration } from "oidc-provider";
import { z } from "zod";
import type { PersistenceClient } from "../../persistence/persistence.client";
import { oauthAdapterFactory } from "./oauth-adapter";
import {
  MCP_ACCESS_SECONDS,
  MCP_GRANT_SECONDS,
  MCP_READ_SCOPE,
  mcpResourceMatches,
  oauthRedirectAllowed,
} from "./oauth-policy";
import { OAuthStateCrypto } from "./oauth-state-crypto";

export interface OAuthSettings {
  issuer: string;
  resource: string;
  uiOrigin: string;
  stateKey: string;
  jwks: string;
  trustProxy: boolean;
}

export const MCP_OAUTH_FETCH = Symbol("MCP_OAUTH_FETCH");

const jwksSchema = z.object({
  keys: z
    .array(
      z.object({
        kty: z.enum(["RSA", "EC", "OKP"]),
        kid: z.string().min(1),
        d: z.string().min(1),
        alg: z.string().optional(),
        use: z.string().optional(),
        crv: z.string().optional(),
        n: z.string().optional(),
        e: z.string().optional(),
        p: z.string().optional(),
        q: z.string().optional(),
        dp: z.string().optional(),
        dq: z.string().optional(),
        qi: z.string().optional(),
        x: z.string().optional(),
        y: z.string().optional(),
      }),
    )
    .min(1)
    .max(5),
});

export async function createOAuthProvider(
  settings: OAuthSettings,
  persistence: PersistenceClient,
  providerFetch: typeof globalThis.fetch,
) {
  const { Provider, errors } = await import("oidc-provider");
  const crypto = new OAuthStateCrypto(settings.stateKey);
  const secure = settings.issuer.startsWith("https:");
  const configuration: Configuration = {
    adapter: oauthAdapterFactory(persistence, crypto, {
      replay: () =>
        new errors.InvalidGrant("Authorization credential already consumed"),
      invalidClient: () =>
        new errors.InvalidClientMetadata(
          "Only HTTPS and native loopback redirects are supported",
        ),
    }),
    jwks: jwksSchema.parse(JSON.parse(settings.jwks)),
    clients: [],
    clientDefaults: {
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    },
    clientAuthMethods: [
      "none",
      "client_secret_basic",
      "client_secret_post",
      "private_key_jwt",
    ],
    responseTypes: ["code"],
    scopes: ["openid", "offline_access", MCP_READ_SCOPE],
    pkce: { required: () => true },
    acceptQueryParamAccessTokens: false,
    enableHttpPostMethods: false,
    clockTolerance: 0,
    cookies: {
      keys: [crypto.cookieKey],
      names: {
        session: "lf_mcp_session",
        interaction: "lf_mcp_interaction",
        resume: "lf_mcp_resume",
      },
      long: { secure, httpOnly: true, sameSite: "lax", overwrite: true },
      short: { secure, httpOnly: true, sameSite: "lax", overwrite: true },
    },
    features: {
      devInteractions: { enabled: false },
      registration: { enabled: true, issueRegistrationAccessToken: false },
      registrationManagement: { enabled: false },
      clientIdMetadataDocument: {
        enabled: true,
        ack: "draft-02",
        cacheDuration: { min: 0, max: 300 },
        allowClient: (_ctx, client) =>
          !!client.redirectUris?.length &&
          client.redirectUris.length <= 10 &&
          client.redirectUris.every(oauthRedirectAllowed),
      },
      revocation: { enabled: true },
      resourceIndicators: {
        enabled: true,
        defaultResource: () => {
          throw new errors.InvalidTarget(
            "An explicit MCP resource is required",
          );
        },
        getResourceServerInfo: (_ctx, resource) => {
          if (!mcpResourceMatches(resource, settings.resource))
            throw new errors.InvalidTarget();
          return {
            scope: MCP_READ_SCOPE,
            audience: settings.resource,
            accessTokenFormat: "opaque",
            accessTokenTTL: MCP_ACCESS_SECONDS,
          };
        },
        useGrantedResource: () => false,
      },
      userinfo: { enabled: false },
      rpInitiatedLogout: { enabled: false },
      dPoP: { enabled: false },
      mTLS: { enabled: false },
      pushedAuthorizationRequests: { enabled: false },
      requestObjects: { enabled: false },
    },
    fetchResponseBodyLimits: {
      "client_id metadata document": 16 * 1024,
      jwks_uri: 32 * 1024,
      sector_identifier_uri: 16 * 1024,
    },
    // Preserve the library's pinned public-address dispatcher and abort signal.
    // The injection seam is used only by offline protocol compatibility tests.
    fetch: (input, init) => providerFetch(input, init),
    ttl: {
      AccessToken: MCP_ACCESS_SECONDS,
      AuthorizationCode: 60,
      Interaction: 600,
      Grant: MCP_GRANT_SECONDS,
      Session: MCP_GRANT_SECONDS,
      RefreshToken: MCP_GRANT_SECONDS,
      IdToken: MCP_ACCESS_SECONDS,
    },
    rotateRefreshToken: true,
    issueRefreshToken: (_ctx, client) =>
      client.grantTypeAllowed("refresh_token"),
    expiresWithSession: () => false,
    // A new authorization always needs explicit consent. The just-completed
    // interaction must still be allowed to resume with its own grant.
    loadExistingGrant: (ctx) => {
      const id = ctx.oidc.result?.consent?.grantId;
      return id ? ctx.oidc.provider.Grant.find(id) : undefined;
    },
    revokeGrantPolicy: () => true,
    findAccount: (_ctx, accountId) => ({
      accountId,
      claims: () => ({ sub: accountId }),
    }),
    interactions: {
      url: (_ctx, interaction) => `/oauth/interaction/${interaction.uid}`,
    },
    routes: {
      authorization: "/oauth/authorize",
      token: "/oauth/token",
      registration: "/oauth/register",
      revocation: "/oauth/revoke",
      jwks: "/oauth/jwks",
    },
    renderError: (ctx, out) => {
      ctx.type = "application/json";
      ctx.body = {
        error: out.error,
        error_description: "Authorization request could not be completed",
      };
    },
  };
  const provider = new Provider(settings.issuer, configuration);
  provider.proxy = settings.trustProxy;
  provider.use(async (ctx, next) => {
    ctx.set("Cache-Control", "no-store");
    // oidc-provider builds endpoint and resume URLs from the request origin.
    // Admit only the configured public origin, never an arbitrary Host or an
    // untrusted forwarded alias. TLS proxies must replace forwarded headers.
    if (URL.parse(ctx.href)?.origin !== settings.issuer) {
      ctx.status = 421;
      ctx.body = {
        error: "invalid_request",
        error_description: "Use the configured authorization issuer",
      };
      return;
    }
    // Nest preserves duplicate form values as arrays; never normalize these to a
    // single resource. The provider separately validates all OAuth parameters.
    if (ctx.path === "/oauth/authorize" || ctx.path === "/oauth/token") {
      const req = ctx.req as Request;
      const body: unknown = req.body;
      const resource =
        ctx.method === "GET"
          ? ctx.query.resource
          : body && typeof body === "object" && "resource" in body
            ? body.resource
            : undefined;
      if (!mcpResourceMatches(resource, settings.resource))
        throw new errors.InvalidTarget("An explicit MCP resource is required");
    }
    if (ctx.path === "/oauth/register" && ctx.method === "POST") {
      const body: unknown = (ctx.req as Request).body;
      const metadata = z
        .object({
          redirect_uris: z.array(z.string().max(2048)).min(1).max(10),
          client_name: z.string().max(200).optional(),
        })
        .safeParse(body);
      if (
        !metadata.success ||
        !metadata.data.redirect_uris.every(oauthRedirectAllowed)
      )
        throw new errors.InvalidClientMetadata(
          "Invalid client redirects or metadata",
        );
    }
    await next();
  });
  return provider;
}
