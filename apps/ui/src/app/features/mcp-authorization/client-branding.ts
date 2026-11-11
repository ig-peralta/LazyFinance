/** Presentation only: exact CIMD identity and published callback profile.
 * Never match a name, logo_uri, substring or arbitrary DCR registration.
 * Bundled PNG: 512x512, 7,194 bytes. No runtime external branding requests. */
export function clientLogo(clientId: string, redirectUri: string | null) {
  if (
    clientId !== "https://opencode.ai/oauth/opencode/client.json" ||
    !redirectUri
  )
    return null;
  try {
    const callback = new URL(redirectUri);
    return callback.protocol === "http:" &&
      ["127.0.0.1", "localhost"].includes(callback.hostname) &&
      ["/callback", "/mcp/oauth/callback"].includes(callback.pathname) &&
      !callback.username &&
      !callback.password &&
      !callback.search &&
      !callback.hash
      ? "/opencode-logo.png"
      : null;
  } catch {
    return null;
  }
}
