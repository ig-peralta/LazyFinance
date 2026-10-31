# LazyFinance API

The API is a NestJS/TypeScript service for LazyFinance. It exposes MCP (Model Context Protocol) over Streamable HTTP using `@rekog/mcp-nest`, alongside NestJS's HTTP server. MCP clients connect through `/mcp`.

PostgreSQL access uses `postgres` (postgres.js) and Drizzle ORM. The app checks the database connection during startup; Drizzle Kit manages the schema and checked-in migrations separately. Runtime configuration is loaded with `dotenv` and validated with Zod, and tests use Vitest with SWC.

## Development

From the [monorepo root](../../README.md), install dependencies and start the local database:

```bash
pnpm install
pnpm resources:up
```

Once PostgreSQL is healthy, apply migrations, seed the demo dataset, and start the API in watch mode:

```bash
pnpm --filter api migrate
pnpm --filter api seed
pnpm --filter api dev
```

The API listens on <http://localhost:3000> by default; MCP clients can connect to <http://localhost:3000/mcp>. The app must be able to connect to PostgreSQL when it starts.

The API loads `apps/api/.env` when present (the file is gitignored). Its validated settings are:

| Variable | Default | Purpose |
| --- | --- | --- |
| `NODE_ENV` | `development` | Runtime mode. Mock auth is rejected when set to `production`. |
| `AUTH_PROVIDER` | `mock` | Authentication provider: `mock` for local demo access or `firebase` for the Firebase identity track. |
| `PORT` | `3000` | HTTP and MCP listening port. |
| `POSTGRES_URL` | `postgresql://user:password@localhost:5432/postgres` | PostgreSQL connection string; matches the local resource stack. |
| `CORS_ORIGINS` | `http://localhost:4200,http://127.0.0.1:4200` | Comma-separated allowed browser origins for direct API requests. Set this to your UI's origin if it uses another host or port. |
| `FIREBASE_PROJECT_ID` | Unset | Required for `AUTH_PROVIDER=firebase`. The verifier is available now; user provisioning and protected-request wiring follow in LAZ-44. |
| `FIREBASE_CLIENT_EMAIL` | Unset | Optional Firebase Admin service-account email. Set together with `FIREBASE_PRIVATE_KEY` and `FIREBASE_PROJECT_ID`. |
| `FIREBASE_PRIVATE_KEY` | Unset | Optional Firebase Admin service-account PEM key. Accepts real or escaped newlines; set together with the service-account email. |

See [Firebase identity boundary](../../docs/firebase-identity.md) for accepted tokens,
the Admin configuration, and the planned application-user and SSR handoffs.
For local Compose, supply the Firebase variables in the shell or the Compose
project's root `.env`; `apps/api/.env` applies only when running the API directly.

`GET /auth/config` is public and returns only `{ "provider": "mock" | "firebase" }`
for the login UI. In local `mock` mode, `POST /auth/mock/login` accepts
`{ "email": "demo@lazyfinance.local", "password": "lazyfinance-local-password" }`
after the demo seed is applied and returns a bearer token. Invalid credentials
return 401; the endpoint is unavailable in Firebase mode, which also rejects
demo tokens. The Firebase browser login and application-user mapping are the
subsequent LAZ-43 and LAZ-44 slices.

## Commands

Run these from the monorepo root:

| Command | Purpose |
| --- | --- |
| `pnpm --filter api dev` | Start NestJS with file watching. |
| `pnpm --filter api build` | Compile the API into `apps/api/dist`. |
| `pnpm --filter api test` | Run Vitest tests. |
| `pnpm --filter api typecheck` | Type-check without emitting files. |
| `pnpm --filter api seed` | Populate the demo dataset; safe to run more than once. |
| `pnpm --filter api migrate` | Apply pending migrations using the API's Drizzle Kit config. |
| `pnpm --filter api drizzle <command>` | Run Drizzle Kit with this app's config. |

The demo user is `demo@lazyfinance.local` with the local password above and bearer token `lazyfinance-demo-token`. The seed creates CLP accounts, categories, objectives, and a dated transaction history from January 2024 through the present, including recurring income and expenses, transfers, credit-card payments, and seasonal spending in Chile. It uses the API's `POSTGRES_URL` (including `apps/api/.env` when present); run migrations first. Rerunning it updates the same demo records without deleting other users' data. The credentials and dataset are for local development only.

### Drizzle Kit

`pnpm --filter api migrate` is the shortcut for `drizzle-kit migrate --config ./src/drizzle/drizzle.config.ts`. For any Drizzle Kit command, `pnpm --filter api drizzle <command>` gives access to the **full Drizzle Kit CLI** with the same config; it is not limited to a fixed set of subcommands. For example:

```bash
pnpm --filter api drizzle generate --name=add_created_at_column  # generate a named migration
pnpm --filter api migrate                                        # apply migrations to PostgreSQL
pnpm --filter api drizzle studio                                 # open Drizzle Studio
```

Replace `add_created_at_column` with a descriptive name for your schema change; always pass `--name` when generating migrations.

The config points to `src/drizzle/schema/index.ts` and writes migration files to `src/drizzle/migrations`. It uses `POSTGRES_URL` from the process environment when set, otherwise the same local PostgreSQL URL shown above. The API's `.env` is loaded by the NestJS app, not explicitly by the Drizzle config; set `POSTGRES_URL` in the shell when using Drizzle Kit against a different database. Migrations are not run automatically on API startup. See the [Drizzle Kit CLI reference](https://orm.drizzle.team/docs/kit-overview) for all available commands and options.
