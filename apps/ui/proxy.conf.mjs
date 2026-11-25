const api = {
  target: process.env.API_PROXY_TARGET || "http://127.0.0.1:3000",
  prependPath: false,
  // The optional OAuth issuer uses the browser-facing Host, not the API target.
  changeOrigin: false,
};

export default {
  "^/(?:trpc|assistant)(?:[/?]|$)": api,
  // Keep the optional MCP cookie, authorize/resume and protocol endpoints on the
  // same canonical origin. /autorizar-mcp itself is an Angular route.
  "^/oauth/(?:interaction|authorize)(?:[/?]|$)": api,
  "^/oauth/(?:token|register|revoke|jwks)/?(?:\\?|$)": api,
  "^/mcp/?(?:\\?|$)": api,
  "^/\\.well-known/(?:oauth-protected-resource(?:/mcp)?|oauth-authorization-server|openid-configuration)/?(?:\\?|$)":
    api,
};
