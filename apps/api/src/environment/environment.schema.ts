import { z } from "zod";

export type EnvironmentVariables = z.infer<typeof ENV_SCHEMA>;

const corsOrigin = z.url().refine(
  (value) => (value.startsWith('http://') || value.startsWith('https://')) && new URL(value).origin === value,
  'Expected an HTTP(S) origin without a path',
);

export const ENV_SCHEMA = z.object({
  PORT: z.coerce.number().positive().default(3000),
  POSTGRES_URL: z.url().default("postgresql://user:password@localhost:5432/postgres"),
  CORS_ORIGINS: z.string()
    .default('http://localhost:4200,http://127.0.0.1:4200')
    .transform((value) => value.split(',').map((origin) => origin.trim()))
    .pipe(z.array(corsOrigin).min(1)),
});
