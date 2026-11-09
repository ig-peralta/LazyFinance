import { describe, expect, it } from "vitest";
import { ENV_SCHEMA } from "./environment.schema";

describe("CORS origins", () => {
  it("parses a comma-separated allowlist of browser origins", () => {
    expect(
      ENV_SCHEMA.parse({
        CORS_ORIGINS: " https://ui.example.cl , http://localhost:4200 ",
      }).CORS_ORIGINS,
    ).toEqual(["https://ui.example.cl", "http://localhost:4200"]);
  });

  it.each([
    "*",
    "",
    "http://localhost:4200/path",
    "not-an-origin",
  ])("rejects invalid origins: %s", (origins) =>
    expect(() => ENV_SCHEMA.parse({ CORS_ORIGINS: origins })).toThrow());
});

describe("Firebase project configuration", () => {
  it("keeps Firebase verification optional until the application-user integration is enabled", () => {
    expect(ENV_SCHEMA.parse({}).FIREBASE_PROJECT_ID).toBeUndefined();
    expect(
      ENV_SCHEMA.parse({ FIREBASE_PROJECT_ID: " lazyfinance-dev " })
        .FIREBASE_PROJECT_ID,
    ).toBe("lazyfinance-dev");
  });

  it("rejects an empty configured project", () => {
    expect(() => ENV_SCHEMA.parse({ FIREBASE_PROJECT_ID: " " })).toThrow();
  });

  it("accepts a service-account email and key together with a project ID", () => {
    expect(
      ENV_SCHEMA.parse({
        FIREBASE_PROJECT_ID: "lazyfinance-dev",
        FIREBASE_CLIENT_EMAIL:
          " firebase-adminsdk@lazyfinance-dev.iam.gserviceaccount.com ",
        FIREBASE_PRIVATE_KEY:
          "-----BEGIN PRIVATE KEY-----\\nkey\\n-----END PRIVATE KEY-----",
      }).FIREBASE_CLIENT_EMAIL,
    ).toBe("firebase-adminsdk@lazyfinance-dev.iam.gserviceaccount.com");
  });

  it.each([
    {
      FIREBASE_PROJECT_ID: "lazyfinance-dev",
      FIREBASE_CLIENT_EMAIL: "admin@example.com",
    },
    {
      FIREBASE_PROJECT_ID: "lazyfinance-dev",
      FIREBASE_PRIVATE_KEY: "private-key",
    },
    {
      FIREBASE_CLIENT_EMAIL: "admin@example.com",
      FIREBASE_PRIVATE_KEY: "private-key",
    },
    {
      FIREBASE_PROJECT_ID: "lazyfinance-dev",
      FIREBASE_CLIENT_EMAIL: " ",
      FIREBASE_PRIVATE_KEY: "private-key",
    },
  ])("rejects incomplete Firebase service-account configuration: %j", (configuration) => {
    expect(() => ENV_SCHEMA.parse(configuration)).toThrow();
  });
});

describe("authentication provider configuration", () => {
  it("defaults to mock for local development and accepts Firebase with a project ID", () => {
    expect(ENV_SCHEMA.parse({}).AUTH_PROVIDER).toBe("mock");
    expect(
      ENV_SCHEMA.parse({
        AUTH_PROVIDER: "firebase",
        FIREBASE_PROJECT_ID: "lazyfinance-dev",
      }).AUTH_PROVIDER,
    ).toBe("firebase");
  });

  it.each([
    "demo",
    "",
    "other",
  ])("rejects unknown providers: %s", (provider) => {
    expect(() => ENV_SCHEMA.parse({ AUTH_PROVIDER: provider })).toThrow();
  });

  it("requires a project ID for Firebase and blocks mock authentication in production", () => {
    expect(() => ENV_SCHEMA.parse({ AUTH_PROVIDER: "firebase" })).toThrow();
    expect(() =>
      ENV_SCHEMA.parse({ NODE_ENV: "production", AUTH_PROVIDER: "mock" }),
    ).toThrow();
    expect(
      ENV_SCHEMA.parse({
        NODE_ENV: "production",
        AUTH_PROVIDER: "firebase",
        FIREBASE_PROJECT_ID: "lazyfinance-prod",
      }).AUTH_PROVIDER,
    ).toBe("firebase");
  });
});

describe("Fintoc server credential configuration", () => {
  const keys = {
    FINTOC_PUBLIC_KEY: "pk_test_fixture",
    FINTOC_SECRET_KEY: "sk_test_fixture",
    FINTOC_TOKEN_ENCRYPTION_KEY: "1".repeat(64),
  };
  it("is disabled by default and accepts complete matching test/live keys", () => {
    expect(ENV_SCHEMA.parse({}).FINTOC_SECRET_KEY).toBeUndefined();
    expect(ENV_SCHEMA.parse(keys).FINTOC_PUBLIC_KEY).toBe(
      keys.FINTOC_PUBLIC_KEY,
    );
    expect(
      ENV_SCHEMA.parse({
        ...keys,
        FINTOC_PUBLIC_KEY: "pk_live_fixture",
        FINTOC_SECRET_KEY: "sk_live_fixture",
      }).FINTOC_PUBLIC_KEY,
    ).toBe("pk_live_fixture");
  });
  it.each([
    { FINTOC_PUBLIC_KEY: "pk_test_fixture" },
    { ...keys, FINTOC_SECRET_KEY: "sk_live_fixture" },
    { ...keys, FINTOC_TOKEN_ENCRYPTION_KEY: "short" },
  ])("rejects incomplete, mixed-mode or invalid encryption settings", (config) => {
    expect(ENV_SCHEMA.safeParse(config).success).toBe(false);
  });
});

describe("external MCP OAuth configuration", () => {
  const oauth = {
    MCP_OAUTH_ISSUER: "http://127.0.0.1:43371",
    MCP_OAUTH_UI_ORIGIN: "http://127.0.0.1:43372",
    MCP_OAUTH_STATE_KEY: "2".repeat(64),
    MCP_OAUTH_JWKS: '{"keys":[]}',
  };

  it("is disabled without configuration and requires the complete independent key set", () => {
    expect(ENV_SCHEMA.parse({}).MCP_OAUTH_ISSUER).toBeUndefined();
    expect(ENV_SCHEMA.parse(oauth).MCP_OAUTH_TRUST_PROXY).toBe("false");
    for (const key of Object.keys(oauth))
      expect(ENV_SCHEMA.safeParse({ ...oauth, [key]: undefined }).success).toBe(
        false,
      );
    expect(
      ENV_SCHEMA.safeParse({ ...oauth, MCP_OAUTH_STATE_KEY: "short" }).success,
    ).toBe(false);
  });

  it("requires canonical origins and HTTPS outside development loopback", () => {
    for (const issuer of [
      "http://api.example",
      "https://api.example/oauth",
      "https://api.example/",
      "https://user:secret@api.example",
      "https://api.example#fragment",
    ])
      expect(
        ENV_SCHEMA.safeParse({ ...oauth, MCP_OAUTH_ISSUER: issuer }).success,
      ).toBe(false);
    expect(
      ENV_SCHEMA.safeParse({
        ...oauth,
        NODE_ENV: "production",
        AUTH_PROVIDER: "firebase",
        FIREBASE_PROJECT_ID: "fixture",
      }).success,
    ).toBe(false);
    expect(
      ENV_SCHEMA.safeParse({
        ...oauth,
        NODE_ENV: "production",
        AUTH_PROVIDER: "firebase",
        FIREBASE_PROJECT_ID: "fixture",
        MCP_OAUTH_ISSUER: "https://api.example",
        MCP_OAUTH_UI_ORIGIN: "https://app.example",
      }).success,
    ).toBe(true);
  });
});
