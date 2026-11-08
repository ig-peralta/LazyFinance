# LazyFinance

LazyFinance helps people understand their finances without manually reconciling balances and transactions. Its own conversational agent (text first, voice later) and dashboard are the initial experiences built on a shared financial core. MCP opens another path: authorized agents could use permitted financial context in workflows people already know, combining it with their own capabilities. Provider-neutral data access leaves room for more sources, financial services and audiences as those uses are validated.

LazyFinance is a pnpm/Turborepo monorepo with an Angular app, a NestJS API, and a private NestJS/Kysely persistence service. Browser and internal service calls use tRPC; MCP remains available over Streamable HTTP.

## Technologies

| Workspace  | Stack                                | Development guide                |
| ---------- | ------------------------------------ | -------------------------------- |
| `apps/ui`  | Angular, public prerendering/private CSR, PrimeNG, Tailwind CSS | [UI README](apps/ui/README.md) |
| `apps/api` | NestJS, tRPC, MCP, financial workflows | [API README](apps/api/README.md) |
| `apps/persistence` | NestJS, tRPC, Kysely, PostgreSQL RLS | [Persistence README](apps/persistence/README.md) |

The apps use TypeScript/Node.js, PostgreSQL 18, Firebase identity, Zod, Vitest and Docker Compose. `libs/contracts` owns public/private schemas; `libs/rpc-api` and `libs/rpc-persistence` export generated router types. Normal builds do not regenerate types or compile another application's source.

## Architecture

```mermaid
flowchart TB
    subgraph interfaces["Interfaces"]
        ui["Angular UI<br/>Public prerender · browser workspace"]
        mcp["MCP clients<br/>Authenticated · read-only"]
    end

    api["Public API · NestJS<br/>Identity verification<br/>Financial workflows"]

    subgraph privateData["Private data boundary"]
        persistence["Persistence · NestJS/Kysely<br/>Scoped transactions<br/>Atomic commands"]
        postgres[("PostgreSQL 18<br/>identity + finance<br/>User-level RLS")]

        persistence -->|SQL · restricted role| postgres
    end

    ui -->|Public tRPC · bearer token| api
    mcp -->|MCP · Streamable HTTP| api
    api -->|Signed private tRPC| persistence

    classDef interface stroke:#3b82f6,stroke-width:2px
    classDef service stroke:#16a34a,stroke-width:2px
    classDef database stroke:#64748b,stroke-width:2px
    class ui,mcp interface
    class api,persistence service
    class postgres database
    style privateData fill:none,stroke:#64748b,stroke-dasharray:5 5
```

The API verifies users and owns financial rules, scheduling, tag matching and provider orchestration. It has no database connection or credentials. Persistence verifies short-lived signed service assertions and enforces user RLS in a transaction per procedure. Only migration/seed tooling receives owner credentials. There is no tenancy layer or automatic old-database adoption. Local demo data supports validation without a bank adapter; external-client authorization, Fintoc and the conversational agent remain later work. See the [architecture](docs/technical/architecture.md), [RPC/RLS security](docs/technical/persistence-security.md) and [banking boundary](apps/api/src/banking/README.md).

The separate [innovation reference](docs/product/innovation.md) explains how reusable financial understanding could connect more sources and destinations, including an authorized agent combining LazyFinance context with its own tools. These opportunities are not claims of shipped integrations.

The [documentation index below](#documentation) covers the current implementation guides, product direction, planning records and academic submissions. Each distinguishes implemented behavior from targets and historical evidence.

## Team and roles

| Team member        | Role / initial focus in the Phase 1 plan             |
| ------------------ | ---------------------------------------------------- |
| Ignacio Peralta    | Banking connectivity and the first-party text agent. |
| Alejandra Ñanculeo | Financial-domain logic and the web dashboard.        |
| Álvaro Díaz        | MCP tools and the later voice interaction.           |

These are initial areas of responsibility, not exclusive assignments: the team shares planning, testing, and documentation, and individual task ownership is recorded in Linear when assigned.

## Methodology

The project follows **iterative and incremental development with agile practices, without claiming a formal Scrum framework**. The financial core was validated with controlled data before advancing to parallel work on the UI, identity, provider connectivity, and agent. **Each stage milestone is one sprint; its assigned Linear issues are that sprint's Sprint Backlog.** The team does not create separate Linear cycles. For reviewers without access to Linear, the repository provides a [complete dated backlog snapshot with issue-specific completion checks](docs/planning/snapshots/backlog-2026-11-02.md) and **stage-closure evidence**. Sprint C issues will be selected after the Stage B review. The [planning index](docs/planning/README.md) organizes stage scope, criteria and evidence; see also the [method and its rationale](docs/planning/project-method.md) and [product Definition of Done](docs/planning/product-definition-of-done.md).

## Documentation

### Product and innovation

| Document | Purpose |
| --- | --- |
| [Product vision](docs/product/product-vision.md) | Direction, foundational approach and Stage A/B/C decision gates |
| [Innovation and interoperability](docs/product/innovation.md) | Differentiation, source/destination ecosystems, example opportunities and value hypotheses |
| [Product requirements](docs/product/product-requirements.md) | Expected capabilities and acceptance/scope boundaries, not a shipped-feature inventory |
| [Non-functional requirements](docs/product/non-functional-requirements.md) | Privacy, isolation, correctness, recoverability, performance and usability targets |
| [User journeys](docs/product/user-journeys.md) | Observable financial-core outcomes and later experience candidates |

### Current technical references

Start with the [technical documentation index](docs/technical/README.md) for the
reading order and distinction between implementation, evidence and targets.

| Document | Purpose |
| --- | --- |
| [Architecture](docs/technical/architecture.md) | Three-app/runtime boundaries, responsibility split and implementation scope |
| [Private RPC, transactions and RLS](docs/technical/persistence-security.md) | Assertions, bootstrap, runtime roles, related-owner policies, atomicity and budgets |
| [Database model and implemented ERD](docs/technical/database-model.md) | All 24 tables, relationships/keys, representation and fresh-migration lifecycle |
| [RPC contracts and clients](docs/technical/rpc-contracts.md) | Public/private procedures, MCP tools, type-only libraries and generation workflow |
| [Persistence read pattern](docs/technical/persistence-reads.md) | Purpose-shaped joins/aggregates, cardinality, snapshots and data-access review rules |
| [Provider-neutral identity](docs/technical/identity.md) | External provider/issuer/subject mapping, internal principals and current provider-selection limits |
| [UI/session/rendering lifetimes](docs/technical/ui-data-lifecycle.md) | Verified scopes, resources, cancellation, command/read ordering and public-only hydration |
| [Technical manual](docs/technical/technical-manual.md) | Installation, environment/credential separation, Compose, operation and troubleshooting |
| [Development and verification](docs/technical/development-workflow.md) | Build/tooling/DI conventions and serverless, HTTP, DB and live-provider verification tiers |

### App and domain guides

- [API](apps/api/README.md), [persistence](apps/persistence/README.md) and
  [UI](apps/ui/README.md): app-specific setup, commands and runtime constraints.
- [Banking connector and ingestion](apps/api/src/banking/README.md): neutral
  provider facts, sync preparation/commit, tombstones and correction review.
- [Tag decisions and rules](apps/api/src/transactions/tagging/README.md): single
  tag/no-tag/reset, matching, approved rules and atomic decision/event commands.
- Configuration examples: [Compose](.env.example), [API](apps/api/.env.example),
  [persistence](apps/persistence/.env.example); only public placeholders/demo defaults.

### Planning, delivery and dated evidence

| Document | Purpose |
| --- | --- |
| [Planning index](docs/planning/README.md) | Stage-organized scope, completion criteria, rationale and evidence; shared planning references |
| [Project method](docs/planning/project-method.md) | Iterative/incremental approach and milestone-as-sprint rationale |
| [Backlog and stage evidence](docs/planning/backlog.md) | How live issue tracking and dated repository snapshots relate |
| [Product Definition of Done](docs/planning/product-definition-of-done.md) | Agreed-release exit checklist |
| [Stage A](docs/planning/stage-a/README.md) | Financial-core gate criteria, [closure](docs/planning/stage-a/closure.md) and [documentary retrospective](docs/planning/stage-a/retrospective.md) |
| [Stage B](docs/planning/stage-b/README.md) | Six parallel workstreams and gate criteria |
| [Platform evolution alongside Stage B](docs/planning/stage-b/platform-evolution.md) | Product intentions, engineering direction and boundaries of PRs #26–#28 |
| [Stage C](docs/planning/stage-c/README.md) | Candidate direction, post-Stage-B selection rules and gate criteria |
| [Stage-sprint record template](docs/planning/stage-sprint-record-template.md) | Future planning/closure/retrospective record fields; not completed meeting evidence |
| [Backlog snapshot — 2026-11-02](docs/planning/snapshots/backlog-2026-11-02.md) | All 65 issues and individual completion checks at extraction time |

Historical records preserve their original context; old Drizzle references or
earlier validation evidence do not describe the latest runtime by themselves.

### Diagrams and academic submissions

- [Conceptual UML inventory](docs/diagrams/README.md): three unchanged PNG sketches
  with explicit scope/accuracy limits, not the implemented database model.
- [Academic submission index](docs/submissions/README.md): every available shared
  and individual document, including [Phase 1](docs/submissions/README.md#phase-1--project-definition)
  project definition/forms/presentation and [Phase 2](docs/submissions/README.md#phase-2--development-progress)
  progress guides/reflections. Submitted files are evidence, not current setup docs.

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

The UI runs at <http://localhost:4200>, API at <http://localhost:3000>, and private persistence at `127.0.0.1:3001`. Owner credentials belong only to CLI jobs; persistence requires a restricted runtime login. The API connects only through private RPC. Stop resources with `pnpm resources:down` when finished.

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

Use `pnpm --filter <api|persistence|ui> <script>` to run an app script directly; each app README lists its scripts. `pnpm test` is not serverless-only: backend HTTP specs can open listeners and configured integration cases use a database. Choose the [appropriate verification tier](docs/technical/development-workflow.md#verification-tiers).

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

The production UI serves static files through unprivileged Nginx on port `4000`.
Its browser API base URL comes directly from the Angular environment files:
`http://localhost:3000` in development and `https://api.lazyfinance.cl` in production.
Nginx only serves UI files; no API proxy or URL rewriting is involved. A fully
local Docker rehearsal needs a browser-reachable local API URL selected before
building the UI. No API/database request is needed to serve the landing or neutral
startup frame. See [browser and static hosting setup](docs/technical/technical-manual.md#browser-and-static-hosting-destinations).
