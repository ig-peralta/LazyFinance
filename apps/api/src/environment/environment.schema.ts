import { z } from "zod";

export type EnvironmentVariables = z.infer<typeof ENV_SCHEMA>;

const corsOrigin = z
  .url()
  .refine(
    (value) =>
      (value.startsWith("http://") || value.startsWith("https://")) &&
      new URL(value).origin === value,
    "Expected an HTTP(S) origin without a path",
  );

export const ENV_SCHEMA = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    AUTH_PROVIDER: z.enum(["firebase", "mock"]).default("mock"),
    PORT: z.coerce.number().positive().default(3000),
    PERSISTENCE_RPC_URL: z.url().default("http://127.0.0.1:3001"),
    PERSISTENCE_RPC_PRIVATE_KEY: z.string().min(1).optional(),
    PERSISTENCE_RPC_KEY_ID: z.string().min(1).default("primary"),
    FIREBASE_PROJECT_ID: z.string().trim().min(1).optional(),
    FIREBASE_CLIENT_EMAIL: z.string().trim().pipe(z.email()).optional(),
    FIREBASE_PRIVATE_KEY: z.string().trim().min(1).optional(),
    ASSISTANT_PROVIDER: z
      .enum([
        "disabled",
        "demo",
        "openai",
        "anthropic",
        "google",
        "openai-compatible",
      ])
      .default("disabled"),
    ASSISTANT_MODEL: z.string().trim().min(1).max(200).optional(),
    ASSISTANT_API_KEY: z.string().trim().min(1).optional(),
    ASSISTANT_BASE_URL: z.url().optional(),
    ASSISTANT_VOICE_ENABLED: z.enum(["true", "false"]).default("false"),
    ASSISTANT_VOICE_API_KEY: z.string().trim().min(1).optional(),
    ASSISTANT_VOICE_MODEL: z.string().trim().min(1).max(200).optional(),
    ASSISTANT_VOICE_NAME: z.enum(["marin", "cedar"]).default("marin"),
    ASSISTANT_VOICE_MAX_STARTS_PER_HOUR: z.coerce
      .number()
      .int()
      .min(1)
      .max(60)
      .optional(),
    MCP_OAUTH_ISSUER: corsOrigin.optional(),
    MCP_OAUTH_UI_ORIGIN: corsOrigin.optional(),
    MCP_OAUTH_STATE_KEY: z
      .string()
      .regex(/^[a-fA-F0-9]{64}$/)
      .optional(),
    MCP_OAUTH_JWKS: z.string().min(1).optional(),
    MCP_OAUTH_TRUST_PROXY: z.enum(["true", "false"]).default("false"),
    FINTOC_PUBLIC_KEY: z
      .string()
      .regex(/^pk_(test|live)_[A-Za-z0-9_-]+$/)
      .optional(),
    BANKING_AUTOMATIC_SYNC_ENABLED: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    FINTOC_SECRET_KEY: z
      .string()
      .regex(/^sk_(test|live)_[A-Za-z0-9_-]+$/)
      .optional(),
    FINTOC_TOKEN_ENCRYPTION_KEY: z
      .string()
      .regex(/^[a-fA-F0-9]{64}$/)
      .optional(),
    CORS_ORIGINS: z
      .string()
      .default("http://localhost:4200,http://127.0.0.1:4200")
      .transform((value) => value.split(",").map((origin) => origin.trim()))
      .pipe(z.array(corsOrigin).min(1)),
  })
  .superRefine((values, context) => {
    const provider = values.ASSISTANT_PROVIDER;
    if (
      values.ASSISTANT_VOICE_ENABLED === "true" &&
      (!values.ASSISTANT_VOICE_API_KEY ||
        !values.ASSISTANT_VOICE_MODEL ||
        ["disabled", "demo"].includes(provider))
    )
      context.addIssue({
        code: "custom",
        path: ["ASSISTANT_VOICE_ENABLED"],
        message:
          "Voice requires a dedicated key/model and configured non-demo text assistant",
      });
    const issue = (message: string) =>
      context.addIssue({
        code: "custom",
        path: ["ASSISTANT_PROVIDER"],
        message,
      });
    if (provider === "demo" && values.NODE_ENV === "production")
      issue("The assistant demonstration runtime is development-only");
    if (!["disabled", "demo"].includes(provider)) {
      if (!values.ASSISTANT_MODEL)
        issue("An explicit assistant model is required");
      if (provider !== "openai-compatible" && !values.ASSISTANT_API_KEY)
        issue("The selected assistant provider requires an API key");
      if (provider === "openai-compatible" && !values.ASSISTANT_BASE_URL)
        issue("The compatible assistant provider requires a base URL");
    }
    if (values.ASSISTANT_BASE_URL) {
      const url = new URL(values.ASSISTANT_BASE_URL);
      if (
        provider !== "openai-compatible" ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        (url.protocol !== "https:" &&
          !(
            values.NODE_ENV !== "production" &&
            url.protocol === "http:" &&
            ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
          ))
      )
        issue(
          "Assistant base URLs must be trusted HTTPS endpoints or explicit development loopback HTTP",
        );
    }
    const oauth = [
      values.MCP_OAUTH_ISSUER,
      values.MCP_OAUTH_UI_ORIGIN,
      values.MCP_OAUTH_STATE_KEY,
      values.MCP_OAUTH_JWKS,
    ];
    if (oauth.some(Boolean) && !oauth.every(Boolean))
      context.addIssue({
        code: "custom",
        path: ["MCP_OAUTH_ISSUER"],
        message:
          "MCP OAuth issuer, UI origin, state key and signing JWKS must be configured together",
      });
    for (const value of [
      values.MCP_OAUTH_ISSUER,
      values.MCP_OAUTH_UI_ORIGIN,
    ].filter((value): value is string => !!value)) {
      const url = new URL(value);
      if (
        url.protocol !== "https:" &&
        (values.NODE_ENV === "production" ||
          !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
      )
        context.addIssue({
          code: "custom",
          path: ["MCP_OAUTH_ISSUER"],
          message:
            "MCP OAuth requires HTTPS except explicit development loopback origins",
        });
    }
    const banking = [
      values.FINTOC_PUBLIC_KEY,
      values.FINTOC_SECRET_KEY,
      values.FINTOC_TOKEN_ENCRYPTION_KEY,
    ];
    if (banking.some(Boolean) && !banking.every(Boolean))
      context.addIssue({
        code: "custom",
        path: ["FINTOC_SECRET_KEY"],
        message:
          "Fintoc public, secret and token encryption keys must be configured together",
      });
    if (
      values.FINTOC_PUBLIC_KEY &&
      values.FINTOC_SECRET_KEY &&
      values.FINTOC_PUBLIC_KEY.split("_")[1] !==
        values.FINTOC_SECRET_KEY.split("_")[1]
    )
      context.addIssue({
        code: "custom",
        path: ["FINTOC_SECRET_KEY"],
        message: "Fintoc public and secret key modes must match",
      });
    if (values.AUTH_PROVIDER === "mock" && values.NODE_ENV === "production") {
      context.addIssue({
        code: "custom",
        message: "Mock authentication is only available in development",
        path: ["AUTH_PROVIDER"],
      });
    }

    if (values.AUTH_PROVIDER === "firebase" && !values.FIREBASE_PROJECT_ID) {
      context.addIssue({
        code: "custom",
        message: "FIREBASE_PROJECT_ID is required for Firebase authentication",
        path: ["FIREBASE_PROJECT_ID"],
      });
    }

    const hasEmail = values.FIREBASE_CLIENT_EMAIL !== undefined;
    const hasKey = values.FIREBASE_PRIVATE_KEY !== undefined;

    if (hasEmail !== hasKey) {
      context.addIssue({
        code: "custom",
        message:
          "FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY must be set together",
        path: ["FIREBASE_PRIVATE_KEY"],
      });
    }

    if ((hasEmail || hasKey) && !values.FIREBASE_PROJECT_ID) {
      context.addIssue({
        code: "custom",
        message:
          "FIREBASE_PROJECT_ID is required when Firebase service account credentials are set",
        path: ["FIREBASE_PROJECT_ID"],
      });
    }
  });
