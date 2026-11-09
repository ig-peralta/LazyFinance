import { describe, expect, it } from "vitest";
import {
  mcpResourceMatches,
  mcpScopes,
  oauthRedirectAllowed,
} from "./oauth-policy";

describe("standards-based external MCP permission and URI policy", () => {
  it.each([
    "https://client.example/callback?x=1",
    "http://localhost:43219/callback",
    "http://127.0.0.1:43219/callback",
    "http://[::1]:43219/callback",
  ])("allows HTTPS or native loopback callbacks: %s", (uri) => {
    expect(oauthRedirectAllowed(uri)).toBe(true);
  });

  it.each([
    "http://client.example/callback",
    "javascript:alert(1)",
    "file:///callback",
    "https://user:secret@client.example/callback",
    "https://client.example/callback#fragment",
    "http://127.0.0.2/callback",
    "not a URL",
  ])("rejects unsafe callbacks: %s", (uri) => {
    expect(oauthRedirectAllowed(uri)).toBe(false);
  });

  it("accepts only the read permission and explicit identity/offline additions", () => {
    expect(
      mcpScopes("finance:read openid offline_access finance:read"),
    ).toEqual(["finance:read", "openid", "offline_access"]);
    for (const scope of [
      "",
      "openid",
      "offline_access",
      "finance:read finance:write",
      "finance:read profile",
      "finance:read\nopenid",
    ])
      expect(() => mcpScopes(scope)).toThrow("Unsupported");
  });

  it("normalizes URL scheme/host, not the target resource path or query", () => {
    const resource = "https://api.example/mcp";
    expect(mcpResourceMatches("HTTPS://API.EXAMPLE/mcp", resource)).toBe(true);
    for (const target of [
      undefined,
      [resource],
      "https://api.example/mcp/",
      "https://api.example/trpc",
      `${resource}?x=1`,
      `${resource}#x`,
      "https://other.example/mcp",
      "https://a:b@api.example/mcp",
    ])
      expect(mcpResourceMatches(target, resource)).toBe(false);
  });
});
