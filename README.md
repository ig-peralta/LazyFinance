# LazyFinance

LazyFinance is a pnpm/Turborepo monorepo with an Angular web app and a NestJS API. The development stack includes PostgreSQL, Drizzle for database access and migrations, and MCP over Streamable HTTP for API integrations.

| Workspace | Stack | Development guide |
| --- | --- | --- |
| `apps/ui` | Angular, SSR, PrimeNG, Tailwind CSS | [UI README](apps/ui/README.md) |
| `apps/api` | NestJS, MCP, Drizzle ORM, PostgreSQL | [API README](apps/api/README.md) |

## Prerequisites

- Node.js 22.22.3+ or 24.15.0+ (supported by the installed Angular CLI).
- pnpm 9 (`corepack enable` can provide the version declared in `package.json`).
- Docker with Compose for the local PostgreSQL service or the containerized stack.

## Run locally

From the repository root:

```bash
pnpm install
pnpm resources:up
```

Once PostgreSQL is healthy, apply the checked-in migrations, seed the demo dataset, and start both apps:

```bash
pnpm --filter api drizzle migrate
pnpm --filter api seed
pnpm dev
```

The UI runs at <http://localhost:4200> and the API at <http://localhost:3000>. The API needs PostgreSQL available at startup. The local resource stack provides it at `localhost:5432`, matching the API's default `POSTGRES_URL`. Stop the database with `pnpm resources:down` when finished.

To run just one app, use `pnpm --filter ui dev` or `pnpm --filter api dev` from the root. The API still needs PostgreSQL; see the [API README](apps/api/README.md) for environment variables and Drizzle commands.

## Workspace commands

These scripts run from the repository root. Turborepo runs tasks in the workspaces that define them.

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Run both development servers (watch mode). |
| `pnpm build` | Build the apps. |
| `pnpm test` | Run the apps' test scripts. |
| `pnpm typecheck` | Run workspace type checks. |
| `pnpm resources` | Pass additional arguments to `docker compose -f docker/local/resources.yml`. |
| `pnpm resources:up` / `pnpm resources:down` | Start / stop local PostgreSQL. |
| `pnpm deploy:local` | Pass additional arguments to `docker compose -f docker/local/deploy.yml`. |
| `pnpm deploy:local:up` / `pnpm deploy:local:down` | Build and start / stop the full containerized stack. |

Use `pnpm --filter api <script>` or `pnpm --filter ui <script>` to run an app script directly; each app README lists its scripts.

## Docker Compose

- **Development resources** (`docker/local/resources.yml`): PostgreSQL 18 on host port `5432`, with default database `postgres`, user `user`, and password `password`. Use `pnpm resources:up` alongside the local app servers. This Compose file does not configure a named database volume.
- **Apps on the resource network** (`docker/local/apps.yml`): builds the API and UI images, publishing them on host ports `3000` and `4200`. It expects the external `lazyfinance` network created by the resources stack. Start `pnpm resources:up` first, then `docker compose -f docker/local/apps.yml up --build -d`; stop the apps with `docker compose -f docker/local/apps.yml down` before `pnpm resources:down`.
- **Full local deployment** (`docker/local/deploy.yml`): PostgreSQL 18, API, and UI in one stack. Run `pnpm deploy:local:up` and `pnpm deploy:local:down`. The database uses a named volume and is not published to the host. The API is exposed on `${API_PORT:-3000}` and the UI on `${UI_PORT:-4200}`; `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB` can also be set for this stack.

Both app images build from the monorepo and run the compiled API and Angular SSR server. Compose does not apply Drizzle migrations automatically; use the [API's Drizzle CLI shortcut](apps/api/README.md#drizzle-kit) against the database you intend to initialize.
