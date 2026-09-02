import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/drizzle/schema/index.ts',
  out: './src/drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.POSTGRES_URL ?? 'postgresql://user:password@localhost:5432/postgres',
  },
  verbose: true,
  strict: true,
});
