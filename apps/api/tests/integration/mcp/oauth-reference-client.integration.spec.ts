import {
  auth,
  Client,
  type OAuthClientProvider,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { oauthAppFixture } from "../../fixtures/mcp/oauth-app";
import { integration } from "../../fixtures/persistence";

describe.skipIf(!integration)("official MCP SDK 2.4 reference client", () => {
  it("discovers, registers, authorizes, reads owned facts, refreshes and loses access after revocation", async () => {
    const f = await oauthAppFixture();
    let client: Client | undefined;
    try {
      let information: Awaited<
        ReturnType<OAuthClientProvider["clientInformation"]>
      >;
      let tokens: Awaited<ReturnType<OAuthClientProvider["tokens"]>>;
      let verifier = "",
        redirect: URL | undefined;
      const provider: OAuthClientProvider = {
        redirectUrl: f.callback,
        clientMetadata: {
          client_name: "LazyFinance SDK reference",
          redirect_uris: [f.callback],
          application_type: "native",
          token_endpoint_auth_method: "none",
          grant_types: ["authorization_code", "refresh_token"],
          response_types: ["code"],
        },
        state: () => "fixture-state",
        clientInformation: () => information,
        saveClientInformation: (value) => {
          information = value;
        },
        tokens: () => tokens,
        saveTokens: (value) => {
          tokens = value;
        },
        saveCodeVerifier: (value) => {
          verifier = value;
        },
        codeVerifier: () => verifier,
        redirectToAuthorization: (url) => {
          redirect = url;
        },
      };
      const paths: string[] = [];
      const trackedFetch: typeof globalThis.fetch = (input, init) => {
        paths.push(
          new URL(input instanceof Request ? input.url : String(input))
            .pathname,
        );
        return fetch(input, init);
      };
      const options = {
        serverUrl: f.resource,
        scope: "finance:read offline_access",
        fetchFn: trackedFetch,
      };
      expect(await auth(provider, options)).toBe("REDIRECT");
      if (!redirect) throw new Error("SDK did not start authorization");
      const authorizationUrl: URL = redirect,
        agent = f.browser();
      const started = await agent
        .get(`${authorizationUrl.pathname}${authorizationUrl.search}`)
        .expect(303);
      const location = z.string().parse(started.headers.location),
        id = location.split("/").at(-1);
      if (!id) throw new Error("Missing SDK authorization interaction");
      const approved = await f.approve({ agent, id });
      expect(
        await auth(provider, {
          ...options,
          authorizationCode: approved.code,
          iss: approved.iss,
        }),
      ).toBe("AUTHORIZED");
      expect(paths).toContain("/.well-known/oauth-authorization-server");
      expect(paths).toContain("/oauth/register");
      expect(paths).toContain("/oauth/token");
      const transport = new StreamableHTTPClientTransport(new URL(f.resource), {
        authProvider: provider,
      });
      client = new Client(
        { name: "lazyfinance-reference", version: "1.0.0" },
        { versionNegotiation: { mode: "legacy" } },
      );
      await client.connect(transport);
      const tools = (await client.listTools()).tools;
      expect(tools).toHaveLength(16);
      for (const tool of tools) expect(tool.inputSchema.type).toBe("object");
      expect(
        tools.find((tool) => tool.name === "preview_financial_action")
          ?.inputSchema.required,
      ).toEqual(["action"]);
      const result = await client.callTool({
        name: "get_account_balances",
        arguments: {},
      });
      expect(result.structuredContent).toEqual({
        accounts: await f.api.client().accounts.list.query(),
      });
      const previous = z.string().parse(tokens?.refresh_token);
      expect(await auth(provider, options)).toBe("AUTHORIZED");
      expect(tokens?.refresh_token).not.toBe(previous);
      const grant = (await f.api.client().mcpAccess.grants.query())[0];
      await f.api.client().mcpAccess.revoke.mutate({ id: grant.id });
      await f
        .mcp(z.string().parse(tokens?.access_token), "tools/list")
        .expect(401);
    } finally {
      await client?.close();
      await f.close();
    }
  });
});
