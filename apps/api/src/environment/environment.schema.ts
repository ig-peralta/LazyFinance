import { z } from "zod";

export type EnvironmentVariables = z.infer<typeof ENV_SCHEMA>;

const corsOrigin = z.url().refine(
  (value) => (value.startsWith('http://') || value.startsWith('https://')) && new URL(value).origin === value,
  'Expected an HTTP(S) origin without a path',
);

export const ENV_SCHEMA = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  AUTH_PROVIDER: z.enum(['firebase', 'mock']).default('mock'),
  PORT: z.coerce.number().positive().default(3000),
  POSTGRES_URL: z.url().default("postgresql://user:password@localhost:5432/postgres"),
  FIREBASE_PROJECT_ID: z.string().trim().min(1).optional(),
  FIREBASE_CLIENT_EMAIL: z.string().trim().pipe(z.email()).optional(),
  FIREBASE_PRIVATE_KEY: z.string().trim().min(1).optional(),
  CORS_ORIGINS: z.string()
    .default('http://localhost:4200,http://127.0.0.1:4200')
    .transform((value) => value.split(',').map((origin) => origin.trim()))
    .pipe(z.array(corsOrigin).min(1)),
}).superRefine((values, context) => {
  if (values.AUTH_PROVIDER === 'mock' && values.NODE_ENV === 'production') {
    context.addIssue({
      code: 'custom',
      message: 'Mock authentication is only available in development',
      path: ['AUTH_PROVIDER'],
    });
  }
  if (values.AUTH_PROVIDER === 'firebase' && !values.FIREBASE_PROJECT_ID) {
    context.addIssue({
      code: 'custom',
      message: 'FIREBASE_PROJECT_ID is required for Firebase authentication',
      path: ['FIREBASE_PROJECT_ID'],
    });
  }
  const hasEmail = values.FIREBASE_CLIENT_EMAIL !== undefined;
  const hasKey = values.FIREBASE_PRIVATE_KEY !== undefined;
  if (hasEmail !== hasKey) {
    context.addIssue({
      code: 'custom',
      message: 'FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY must be set together',
      path: ['FIREBASE_PRIVATE_KEY'],
    });
  }
  if ((hasEmail || hasKey) && !values.FIREBASE_PROJECT_ID) {
    context.addIssue({
      code: 'custom',
      message: 'FIREBASE_PROJECT_ID is required when Firebase service account credentials are set',
      path: ['FIREBASE_PROJECT_ID'],
    });
  }
});
