import { McpPermissionSchema } from "@lazyfinance/contracts";

export const MCP_READ_SCOPE = "finance:read";
export const MCP_GRANT_SECONDS = 30 * 24 * 60 * 60;
export const MCP_ACCESS_SECONDS = 10 * 60;

export function oauthRedirectAllowed(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.username || url.password || url.hash) return false;
    return (
      url.protocol === "https:" ||
      (url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    );
  } catch {
    return false;
  }
}

export function mcpScopes(value: string) {
  const scopes = [...new Set(value.split(" ").filter(Boolean))].map((scope) => {
    const permission = McpPermissionSchema.safeParse(scope);
    if (permission.success) return permission.data;
    throw new Error("Unsupported MCP permissions");
  });
  if (!scopes.includes(MCP_READ_SCOPE))
    throw new Error("Unsupported MCP permissions");
  return scopes;
}

export function mcpResourceMatches(value: unknown, expected: string): boolean {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return (
      !url.hash &&
      !url.username &&
      !url.password &&
      url.href === new URL(expected).href
    );
  } catch {
    return false;
  }
}
