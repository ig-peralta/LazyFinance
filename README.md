# LazyFinance

LazyFinance aims to help people understand their finances and make better decisions without manually reconciling balances and transactions. Its vision centers on a first-party conversational agent (text first, voice later) and a visual dashboard, backed by shared financial logic available to other applications through MCP and designed to support broader financial capabilities over time.

LazyFinance is a pnpm/Turborepo monorepo with an Angular web app and a NestJS API. The development stack includes PostgreSQL, Drizzle for database access and migrations, and MCP over Streamable HTTP for API integrations.

## Technologies

| Workspace  | Stack                                | Development guide                |
| ---------- | ------------------------------------ | -------------------------------- |
| `apps/ui`  | Angular, SSR, PrimeNG, Tailwind CSS  | [UI README](apps/ui/README.md)   |
| `apps/api` | NestJS, MCP, Drizzle ORM, PostgreSQL | [API README](apps/api/README.md) |

Both apps use TypeScript and Node.js. The supporting technologies are pnpm and Turborepo for the monorepo, PostgreSQL 18 and Drizzle for persistence, Firebase for user identity, Zod for validation, Vitest for automated tests, and Docker Compose for local resources and deployment. `libs/contracts` contains shared API contracts.

## Architecture

```text
Browser → Angular web app (apps/ui) → NestJS HTTP API (apps/api)
                                       ↓
                          User-scoped financial services → Drizzle → PostgreSQL
Authorized MCP clients → NestJS MCP endpoint ──────────────┘
```

The Angular web app (`apps/ui`) calls the NestJS HTTP API (`apps/api`). The API owns financial rules and user-scoped access, exposes selected read capabilities to external clients through MCP, and persists data in PostgreSQL through Drizzle. `libs/contracts` holds shared API contracts. Local demo data lets the team validate financial behavior without a bank connection; the provider-neutral banking boundary is in the API, while a Fintoc adapter and our own text agent are later product work. See the [product requirements](docs/product-requirements.md) and [banking connector boundary](apps/api/src/banking/README.md) for scope and design decisions.

## Team and roles

| Team member        | Role / initial focus in the Phase 1 plan             |
| ------------------ | ---------------------------------------------------- |
| Ignacio Peralta    | Banking connectivity and the first-party text agent. |
| Alejandra Ñanculeo | Financial-domain logic and the web dashboard.        |
| Álvaro Díaz        | MCP tools and the later voice interaction.           |

These are initial areas of responsibility, not exclusive assignments: the team shares planning, testing, and documentation, and individual task ownership is recorded in Linear when assigned.

## Methodology

The project follows **iterative and incremental development with agile practices, without claiming a formal Scrum framework**. The financial core was validated with controlled data before advancing to parallel work on the UI, identity, provider connectivity, and agent. **Each stage milestone is one sprint; its assigned Linear issues are that sprint's Sprint Backlog.** The team does not create separate Linear cycles. For reviewers without access to Linear, the repository provides a [complete dated backlog snapshot with issue-specific completion checks](docs/planning/snapshots/backlog-2026-11-02.md) and **stage-closure evidence**. Sprint C issues will be selected after the Stage B review. See the [method and its rationale](docs/project-method.md), [Sprint A/B/C product definitions of done](docs/planning/sprint-definitions-of-done.md), and [product Definition of Done](docs/planning/product-definition-of-done.md).

## Project evidence

- [Product vision, scope, and stage gates](docs/product-requirements.md) and [observable user journeys](docs/user-journeys.md).
- [Methodology and planning evidence](docs/project-method.md), including the [all-issue backlog snapshot and individual completion checks](docs/planning/snapshots/backlog-2026-11-02.md), completed [Sprint A issue/gate record](docs/planning/snapshots/stage-a-closure.md), and [documentary retrospective](docs/planning/stage-a-retrospective.md). Future stage-closure records are added after their gate.
- [Phase 1 project definition and technical report](docs/fase_1/) and [Phase 2 progress guide](docs/fase_2/guia_avance.docx).

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
pnpm --filter api migrate
pnpm --filter api seed
pnpm dev
```

The UI runs at <http://localhost:4200> and the API at <http://localhost:3000>. The API needs PostgreSQL available at startup. The local resource stack provides it at `localhost:5432`, matching the API's default `POSTGRES_URL`. Stop the database with `pnpm resources:down` when finished.

To run just one app, use `pnpm --filter ui dev` or `pnpm --filter api dev` from the root. The API still needs PostgreSQL; see the [API README](apps/api/README.md) for environment variables and Drizzle commands.

## Workspace commands

These scripts run from the repository root. Turborepo runs tasks in the workspaces that define them.

| Command                                           | Purpose                                                                      |
| ------------------------------------------------- | ---------------------------------------------------------------------------- |
| `pnpm dev`                                        | Run both development servers (watch mode).                                   |
| `pnpm build`                                      | Build the apps.                                                              |
| `pnpm test`                                       | Run the apps' test scripts.                                                  |
| `pnpm typecheck`                                  | Run workspace type checks.                                                   |
| `pnpm resources`                                  | Pass additional arguments to `docker compose -f docker/local/resources.yml`. |
| `pnpm resources:up` / `pnpm resources:down`       | Start / stop local PostgreSQL.                                               |
| `pnpm deploy:local`                               | Pass additional arguments to `docker compose -f docker/local/deploy.yml`.    |
| `pnpm deploy:local:up` / `pnpm deploy:local:down` | Build and start / stop the full containerized stack.                         |

Use `pnpm --filter api <script>` or `pnpm --filter ui <script>` to run an app script directly; each app README lists its scripts.

## Docker Compose

- **Development resources** (`docker/local/resources.yml`): PostgreSQL 18 on host port `5432`, with default database `postgres`, user `user`, and password `password`. Use `pnpm resources:up` alongside the local app servers. This Compose file does not configure a named database volume.
- **Apps on the resource network** (`docker/local/apps.yml`): builds the API and UI images, publishing them on host ports `3000` and `4200`. It expects the external `lazyfinance` network created by the resources stack. Start `pnpm resources:up` first, then `docker compose -f docker/local/apps.yml up --build -d`; stop the apps with `docker compose -f docker/local/apps.yml down` before `pnpm resources:down`.
- **Full local deployment** (`docker/local/deploy.yml`): PostgreSQL 18, API, and UI in one stack. Run `pnpm deploy:local:up` and `pnpm deploy:local:down`. The database uses a named volume and is not published to the host. The API is exposed on `${API_PORT:-3000}` and the UI on `${UI_PORT:-4200}`; `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB` can also be set for this stack. If you change `UI_PORT` or the browser-facing host, set `CORS_ORIGINS` to the resulting UI origin.

Both app images build from the monorepo and run the compiled API and Angular SSR server. Compose does not apply Drizzle migrations automatically; use the [API's Drizzle CLI shortcut](apps/api/README.md#drizzle-kit) against the database you intend to initialize.
