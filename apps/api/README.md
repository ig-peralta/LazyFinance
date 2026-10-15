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
pnpm --filter api drizzle migrate
pnpm --filter api seed
pnpm --filter api dev
```

The API listens on <http://localhost:3000> by default; MCP clients can connect to <http://localhost:3000/mcp>. The app must be able to connect to PostgreSQL when it starts.

The API loads `apps/api/.env` when present (the file is gitignored). Its validated settings are:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP and MCP listening port. |
| `POSTGRES_URL` | `postgresql://user:password@localhost:5432/postgres` | PostgreSQL connection string; matches the local resource stack. |

## Commands

Run these from the monorepo root:

| Command | Purpose |
| --- | --- |
| `pnpm --filter api dev` | Start NestJS with file watching. |
| `pnpm --filter api build` | Compile the API into `apps/api/dist`. |
| `pnpm --filter api test` | Run Vitest tests. |
| `pnpm --filter api typecheck` | Type-check without emitting files. |
| `pnpm --filter api seed` | Populate the demo dataset; safe to run more than once. |
| `pnpm --filter api drizzle <command>` | Run Drizzle Kit with this app's config. |

The demo user is `demo@lazyfinance.local` with token `lazyfinance-demo-token`. The seed creates CLP accounts, categories, objectives, and a dated transaction history from January 2024 through the present, including recurring income and expenses, transfers, credit-card payments, and seasonal spending in Chile. It uses the API's `POSTGRES_URL` (including `apps/api/.env` when present); run migrations first. Rerunning it updates the same demo records without deleting other users' data. The token and dataset are for demo use only.

### Drizzle Kit

`pnpm --filter api drizzle <command>` is a shortcut to the **full Drizzle Kit CLI**, automatically passing `--config ./src/drizzle/drizzle.config.ts` from the API workspace. It is not limited to a fixed set of subcommands. For example:

```bash
pnpm --filter api drizzle generate --name=add_created_at_column  # generate a named migration
pnpm --filter api drizzle migrate                                # apply migrations to PostgreSQL
pnpm --filter api drizzle studio                                 # open Drizzle Studio
```

Replace `add_created_at_column` with a descriptive name for your schema change; always pass `--name` when generating migrations.

The config points to `src/drizzle/schema/index.ts` and writes migration files to `src/drizzle/migrations`. It uses `POSTGRES_URL` from the process environment when set, otherwise the same local PostgreSQL URL shown above. The API's `.env` is loaded by the NestJS app, not explicitly by the Drizzle config; set `POSTGRES_URL` in the shell when using Drizzle Kit against a different database. Migrations are not run automatically on API startup. See the [Drizzle Kit CLI reference](https://orm.drizzle.team/docs/kit-overview) for all available commands and options.
