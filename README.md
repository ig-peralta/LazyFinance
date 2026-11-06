# LazyFinance

LazyFinance helps people understand their finances without manually reconciling balances and transactions. Its own conversational agent (text first, voice later) and dashboard are the initial experiences built on a shared financial core. MCP opens another path: authorized agents could use permitted financial context in workflows people already know, combining it with their own capabilities. Provider-neutral data access leaves room for more sources, financial services and audiences as those uses are validated.

LazyFinance is a pnpm/Turborepo monorepo with an Angular app, a NestJS API, and a private NestJS/Kysely persistence service. Browser and internal service calls use tRPC; MCP remains available over Streamable HTTP.

## Technologies

| Workspace  | Stack                                | Development guide                |
| ---------- | ------------------------------------ | -------------------------------- |
| `apps/ui`  | Angular, SSR, PrimeNG, Tailwind CSS  | [UI README](apps/ui/README.md)   |
| `apps/api` | NestJS, tRPC, MCP, financial workflows | [API README](apps/api/README.md) |
| `apps/persistence` | NestJS, tRPC, Kysely, PostgreSQL RLS | [Persistence README](apps/persistence/README.md) |

The apps use TypeScript/Node.js, PostgreSQL 18, Firebase identity, Zod, Vitest and Docker Compose. `libs/contracts` owns public/private schemas; `libs/rpc-api` and `libs/rpc-persistence` export generated router types. Normal builds do not regenerate types or compile another application's source.

## Architecture

```text
Browser/SSR → Angular → public tRPC API → private tRPC persistence → PostgreSQL
MCP clients ─────────→ NestJS MCP ──────┘                           identity/finance + RLS
```

The API verifies users and owns financial rules, scheduling, tag matching and provider orchestration. It has no database connection or credentials. Persistence verifies short-lived signed service assertions and enforces user RLS in a transaction per procedure. Only migration/seed tooling receives owner credentials. There is no tenancy layer or automatic old-database adoption. Local demo data supports validation without a bank adapter; external-client authorization, Fintoc and the conversational agent remain later work. See the [implementation design](docs/planning/persistence-rpc-user-rls-plan.md) and [banking boundary](apps/api/src/banking/README.md).

The [product vision](docs/product/product-vision.md#innovation-and-interoperability-across-ecosystems) describes how another agent could combine permitted LazyFinance financial context with its own tools, such as web research, in a workflow the user already knows.

The [technical evidence index](docs/technical/README.md) links the architecture, non-functional requirements, environment examples and technical manual. Each distinguishes implemented behavior from planned work.

## Team and roles

| Team member        | Role / initial focus in the Phase 1 plan             |
| ------------------ | ---------------------------------------------------- |
| Ignacio Peralta    | Banking connectivity and the first-party text agent. |
| Alejandra Ñanculeo | Financial-domain logic and the web dashboard.        |
| Álvaro Díaz        | MCP tools and the later voice interaction.           |

These are initial areas of responsibility, not exclusive assignments: the team shares planning, testing, and documentation, and individual task ownership is recorded in Linear when assigned.

## Methodology

The project follows **iterative and incremental development with agile practices, without claiming a formal Scrum framework**. The financial core was validated with controlled data before advancing to parallel work on the UI, identity, provider connectivity, and agent. **Each stage milestone is one sprint; its assigned Linear issues are that sprint's Sprint Backlog.** The team does not create separate Linear cycles. For reviewers without access to Linear, the repository provides a [complete dated backlog snapshot with issue-specific completion checks](docs/planning/snapshots/backlog-2026-11-02.md) and **stage-closure evidence**. Sprint C issues will be selected after the Stage B review. See the [method and its rationale](docs/planning/project-method.md), [Sprint A/B/C product definitions of done](docs/planning/sprint-definitions-of-done.md), and [product Definition of Done](docs/planning/product-definition-of-done.md).

## Project evidence

- [Product vision, innovation and stage direction](docs/product/product-vision.md), [product requirements](docs/product/product-requirements.md), [non-functional requirements](docs/product/non-functional-requirements.md) and [observable user journeys](docs/product/user-journeys.md).
- [Methodology and planning evidence](docs/planning/project-method.md), including the [all-issue backlog snapshot and individual completion checks](docs/planning/snapshots/backlog-2026-11-02.md), completed [Sprint A issue/gate record](docs/planning/snapshots/stage-a-closure.md), and [documentary retrospective](docs/planning/stage-a-retrospective.md). Future stage-closure records are added after their gate.
- [Phase 1 project definition, technical report and presentation](docs/submissions/fase1/) and [Phase 2 progress guide](docs/submissions/fase2/2.4_GuiaEstudiante_Fase%202_DesarrolloProyecto%20APT%20%28Espa%C3%B1ol%29.docx).
- [Technical evidence](docs/technical/README.md), including [architecture](docs/technical/architecture.md), [conceptual UML diagrams](docs/diagrams/README.md), [income model](docs/technical/income-model.md), [Firebase identity boundary](docs/technical/firebase-identity.md) and the [technical manual](docs/technical/technical-manual.md).

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

Use a **fresh empty database**. The new migrations do not import old Drizzle history/data or reset databases. If reusing an existing resources container, create a separate `lazyfinance` database explicitly first. Follow the [persistence setup](apps/persistence/README.md) to configure separate owner/runtime credentials and run:

```bash
pnpm exec turbo build --filter=persistence...
POSTGRES_MIGRATION_URL=postgresql://user:password@localhost:5432/lazyfinance pnpm --filter persistence db:migrate
POSTGRES_MIGRATION_URL=postgresql://user:password@localhost:5432/lazyfinance PERSISTENCE_DATABASE_USER=lazyfinance_app PERSISTENCE_DATABASE_PASSWORD=local-runtime-password-change-me pnpm --filter persistence db:provision-runtime
POSTGRES_MIGRATION_URL=postgresql://user:password@localhost:5432/lazyfinance pnpm --filter persistence db:seed
pnpm rpc:keys
# Put the private key only in apps/api/.env and the public key in apps/persistence/.env.
# Copy their .env.example files and configure POSTGRES_RUNTIME_URL in persistence.
pnpm dev
```

The UI runs at <http://localhost:4200>, API at <http://localhost:3000>, and private persistence at `127.0.0.1:3001`. Do not export owner CLI credentials into the app runtimes. The API rejects PostgreSQL credentials; persistence rejects owner/BYPASSRLS runtime logins. Stop resources with `pnpm resources:down` when finished.

App-local `.env` files are separate from the root [Compose environment](.env.example). Never commit real keys/passwords. See the [technical manual](docs/technical/technical-manual.md).

Use `pnpm --filter <ui|api|persistence> dev` to run one app. API operations need persistence; PostgreSQL belongs only to persistence.

## Workspace commands

These scripts run from the repository root. Turborepo runs tasks in the workspaces that define them.

| Command                                           | Purpose                                                                      |
| ------------------------------------------------- | ---------------------------------------------------------------------------- |
| `pnpm dev`                                        | Run all three development servers (watch mode).                              |
| `pnpm build`                                      | Build the apps.                                                              |
| `pnpm test`                                       | Run the apps' test scripts.                                                  |
| `pnpm typecheck`                                  | Run workspace type checks.                                                   |
| `pnpm lint` / `pnpm lint:fix`                      | Check Biome formatting, lint rules and import order / apply safe fixes.        |
| `pnpm format` / `pnpm format:check`                | Format supported workspace files with Biome / check formatting without writing. |
| `pnpm rpc:generate` / `pnpm rpc:check`              | Generate both router libraries / reject generated drift.                      |
| `pnpm check:architecture`                          | Check database, service, browser and router boundaries.                       |
| `TEST_POSTGRES_OWNER_URL=... pnpm test:integration` | Start compiled persistence and test both RPC boundaries on an isolated `_test` DB. |
| `pnpm resources`                                  | Pass additional arguments to `docker compose -f docker/local/resources.yml`. |
| `pnpm resources:up` / `pnpm resources:down`       | Start / stop local PostgreSQL.                                               |
| `pnpm deploy:local`                               | Pass additional arguments to `docker compose -f docker/local/deploy.yml`.    |
| `pnpm deploy:local:up` / `pnpm deploy:local:down` | Build and start / stop the full containerized stack.                         |

Use `pnpm --filter api <script>` or `pnpm --filter ui <script>` to run an app script directly; each app README lists its scripts.

### Formatting and linting

Biome **2.3.11** is the only directly configured formatter/linter, shared by all
apps and libraries through the root `biome.json`. Its parsers support NestJS
parameter decorators, Angular interpolation and Tailwind directives. Automatic
type-only import conversion is disabled to preserve runtime decorator metadata.
HTML formatting is disabled because this Biome version does not safely support
Angular control-flow blocks (`@if`/`@for`); Angular compilation checks templates.
Run `pnpm lint:fix` for safe fixes and import organization, or `pnpm format` for
formatting only. In VS Code, use the recommended `biomejs.biome` extension.

Keep one blank line between class methods/constructors, between fields and
methods, and between independent helper/schema declarations. Group related
simple fields together, and separate validation, processing and result sections
in longer functions. Keep decorators and documentation attached to their
declaration; keep overload signatures grouped. Biome preserves these blank
lines, but does not automatically insert or enforce this logical spacing.

For NestJS class dependencies, use ordinary constructor injection with runtime
class imports. Reserve `@Inject()` for custom tokens such as `RLS_DB` and
`RUNTIME_DB`, or intentional token overrides. Providers must still be registered
locally or exported by an imported module.

Build/cache/coverage output, `.local` secrets/backups and generated RPC routers
are excluded. Router files must remain generator-owned: use `pnpm rpc:generate`
and `pnpm rpc:check`, not a formatter, to update or verify them. Angular HTML,
Markdown and YAML remain manually formatted with this Biome version.

## Docker Compose

- **Resources:** PostgreSQL 18 on loopback port `5432`, default fresh database `lazyfinance`, owner `user` / `password`. No named volume; do not treat it as durable production storage.
- **Apps on resources:** `docker/local/apps.yml` expects the external `lazyfinance` network. Its owner-only `init` job migrates/provisions, then private persistence, API and UI start.
- **Full local deployment:** copy `.env.example` to `.env`, generate keys, then `pnpm deploy:local:up`. The `init` job must succeed before persistence starts. PostgreSQL/persistence have no published ports; the API cannot join the data network. Data uses a named volume. This remains a local demonstration setup, not production secret management or TLS.

Demo seeding is explicit: `pnpm deploy:local --profile tools run --rm seed`. It is not a migration or startup side effect. Existing volumes are not reset or upgraded from the old schema; choose a fresh database. Use Firebase plus `API_NODE_ENV=production` for a production-mode rehearsal; mock auth is development-only.
