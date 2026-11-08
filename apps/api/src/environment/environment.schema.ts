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
    FINTOC_PUBLIC_KEY: z
      .string()
      .regex(/^pk_(test|live)_[A-Za-z0-9_-]+$/)
      .optional(),
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
