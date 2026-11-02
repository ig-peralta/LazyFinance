# Technical manual — installation, operation and boundaries

This manual covers the **current Angular/NestJS/PostgreSQL application**. It is sufficient to reproduce the local demo and inspect its HTTP/MCP behavior. It does not claim that Fintoc linking, external MCP-client authorization, a first-party chat agent, voice or all financial-management screens are shipped. The [architecture](architecture.md), checked-in `apps/api/src/drizzle/schema` and [non-functional requirements](../product/non-functional-requirements.md) provide additional context.

## Requirements and repository layout

- Node.js **22.22.3+** or **24.15.0+**, pnpm 9 (the Angular tooling determines the Node minimum), Git and Docker Engine with Compose.
- `apps/ui`: Angular SSR/browser app; `apps/api`: NestJS API and MCP transport; `libs/contracts`: shared request/response contracts; `docker/local`: local Compose stacks; `apps/api/src/drizzle/schema` and `migrations`: database definition.
- Use **controlled demo data** and the supplied mock login for local verification. Real-user Firebase mode requires a configured Firebase project and Google sign-in enabled. Do not use the example passwords in a public deployment.

## Supported local development path

From the repository root:

```bash
pnpm install
pnpm resources:up
pnpm --filter api migrate
pnpm --filter api seed
pnpm dev
```

The first Compose command starts PostgreSQL 18 on `localhost:5432`; the Drizzle CLI applies versioned migrations explicitly, the seed creates the demo financial history, and `pnpm dev` starts API at `http://localhost:3000` and UI at `http://localhost:4200`. Check `GET http://localhost:3000/` for the `listening` response and open the dashboard after signing in. `pnpm resources:down` stops the DB resource stack. `docker/local/resources.yml` has **no named database volume**, so stopping/recreating its container can remove the data; rerun migrate and seed if needed.

The API can be run alone with `pnpm --filter api dev` after the database is available; UI alone uses `pnpm --filter ui dev`. Shared contracts are installed through the workspace. `pnpm typecheck` and `pnpm build` run the workspace's type and build commands.

### Environment configuration

The API reads `apps/api/.env` **only when run directly** from its app workspace. Copy [`apps/api/.env.example`](../../apps/api/.env.example) there when changing defaults; `POSTGRES_URL`, `AUTH_PROVIDER`, `PORT`, `CORS_ORIGINS` and optional Firebase values are validated by `environment.schema.ts`. `AUTH_PROVIDER=mock` is the local default and is rejected with `NODE_ENV=production`. For Firebase mode, `FIREBASE_PROJECT_ID` is required; the Admin client email and private key are optional but must be supplied together. Never put real credentials in a committed example. The UI's public Firebase Web identifiers live in its Angular environment files and must match the API's project ID.

The Drizzle Kit CLI reads `POSTGRES_URL` from the **shell**, not automatically from `apps/api/.env`. Set the shell variable explicitly when migrating a non-default database. Local Compose uses a separate root [`.env.example`](../../.env.example) for `docker/local/deploy.yml` ports/database variables; copying it to `.env` does not replace `apps/api/.env` for direct runs. The [API README](../../apps/api/README.md#development) documents every validated variable and the [architecture](architecture.md#authentication-sessions-and-ownership) explains token trust and SSR restoration.

### Demo login and endpoints

With `AUTH_PROVIDER=mock` after seeding, `POST /auth/mock/login` accepts the local fixture email `demo@lazyfinance.cl` and password `password`, returning a bearer token. The demo is **development only**. `GET /auth/config` selects mock or Firebase in the UI; `GET /auth/principal` revalidates the signed-in user. Other protected reads include `GET /accounts`, `GET /transactions/recent`, `GET /summaries/monthly?month=YYYY-MM`, `GET /summaries/comparison?month=YYYY-MM`, `GET /objectives`, `GET /objectives/spending-progress?month=YYYY-MM`, and the `/income/...` routes. `apps/api/src/transactions/tagging/tagging.http.ts` defines existing tag decision and rule APIs. `POST /mcp` uses the same authenticated principal and exposes read-only financial tools; external-client token issuance/revocation is future work.

Example mock-mode request after the seed (substitute the bearer token returned by login):

```bash
curl -H 'Content-Type: application/json' -d '{"email":"demo@lazyfinance.cl","password":"password"}' http://localhost:3000/auth/mock/login
curl -H 'Authorization: Bearer <local-demo-token>' http://localhost:3000/accounts
```

The tags and objectives **management pages** are labelled placeholders in this baseline; the dashboard and some backend tag/income operations exist. A provider-neutral ingestion service is tested through fixtures but has no Fintoc link/import UI. The text agent and voice interface do not exist yet. See the [product backlog snapshot](../planning/snapshots/backlog-2026-11-02.md) for the planned slices and the [architecture](architecture.md) for what is implemented.

## Containerized modes and deployment limitation

- **DB resources only:** `pnpm resources:up` is the recommended local development/test path; it publishes PostgreSQL on host port 5432 for explicit migrations and seed.
- **Apps with existing resources:** after starting resources, run `docker compose -f docker/local/apps.yml up --build -d`. It uses the external `lazyfinance` network and publishes API/UI on host ports 3000/4200. Stop the apps before `pnpm resources:down`.
- **Full local stack:** `pnpm deploy:local:up` builds Postgres/API/UI with a named DB volume, but the DB is not published to the host and **migrations/seed do not run automatically**. The runtime API image also omits Drizzle Kit tooling. Treat schema initialization for this stack as a separate deployment task; do not present an empty full-stack DB as a ready demo.

Both images use non-root Node runners. The full stack accepts root `.env` overrides for `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `API_PORT`, `UI_PORT`, `CORS_ORIGINS` and `AUTH_PROVIDER`. It is a **local demonstration stack** with development defaults, not a secure production configuration. Firebase Admin credentials must come from the runtime environment when used, not the repository. Browser-facing API URLs are built into the UI environment; the SSR server can use `API_INTERNAL_URL=http://api:3000` inside the containers.

## Schema change and troubleshooting

- Model edits start in `apps/api/src/drizzle/schema`. Generate a named migration with `pnpm --filter api drizzle generate --name=describe_change`, review the SQL, and apply it with `pnpm --filter api migrate` against the intended DB. A migration does not run on API boot.
- If the API fails at startup, verify PostgreSQL health, `POSTGRES_URL`, migration state, and the validated environment settings. If the UI cannot call the API, verify both ports and `CORS_ORIGINS`; if SSR cannot reach the browser-facing API hostname, set `API_INTERNAL_URL` for the UI server.
- If Firebase sign-in fails, verify the UI Web project ID, API `FIREBASE_PROJECT_ID`, enabled Google provider, authorized domain and token audience. Do not treat a browser cookie as proof of authentication; inspect `/auth/principal` behavior.
- If a dashboard summary disagrees with individual movements, check account type, Santiago period boundaries, internal-movement flags, untagged coverage, and whether credits are confirmed income rather than raw inflows. The [Sprint A retrospective](../planning/stage-a-retrospective.md) contains example reconciliations; the financial services and schema define the current calculation paths.

Known incomplete product areas are described in the [product DoD](../planning/product-definition-of-done.md) and the [dated backlog](../planning/snapshots/backlog-2026-11-02.md). Update this manual when the implementation changes rather than documenting planned features as running commands.
