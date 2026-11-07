# LazyFinance API

NestJS financial workflow service exposing public tRPC at `/trpc` and read-only
MCP at `/mcp`. The only ordinary HTTP route is the public `GET /` listening check.
Business REST controllers have been retired; Angular uses vanilla tRPC clients.

Technical references: [architecture](../../docs/technical/architecture.md),
[provider-neutral identity](../../docs/technical/identity.md),
[RPC contracts/code generation](../../docs/technical/rpc-contracts.md),
[private RPC/RLS](../../docs/technical/persistence-security.md) and
[development/verification](../../docs/technical/development-workflow.md).

## Boundaries

- Firebase Admin/mock verification resolves an external identity through private
  `identity.resolve` and returns an internal application UUID.
- Domain services own money/calendar calculations, income schedules, summaries,
  budget progress, tag matching/ranking and provider orchestration.
- Typed clients call `@lazyfinance/rpc-persistence` with a 30-second Ed25519 JWT.
  Context is immutable per client, and public tRPC request IDs propagate privately.
- **No database driver, pool or SQL access in the API.** Owner-only
  migration/seed commands belong to [persistence](../persistence/README.md).
- Provider calls and preparation stay outside SQL transactions. A prepared sync
  commits facts, conflicts, decisions/events and checkpoint atomically. Known
  stale-input rejections may be recomputed; ambiguous network failures are not retried.

## Development

Follow the [root setup](../../README.md#run-locally), copy `.env.example` into the
ignored `apps/api/.env`, and configure:

| Variable | Purpose |
| --- | --- |
| `PERSISTENCE_RPC_URL` | Private service base URL; default `http://127.0.0.1:3001`. |
| `PERSISTENCE_RPC_PRIVATE_KEY` | API-only Ed25519 PKCS8 PEM; generate with `pnpm rpc:keys`. |
| `PERSISTENCE_RPC_KEY_ID` | Matching key identifier; default `primary`. |
| `AUTH_PROVIDER` | `mock` locally, or `firebase`. |
| `NODE_ENV` | Mock authentication is rejected in `production`. |
| `PORT` | Default `3000`. |
| `CORS_ORIGINS` | Allowed browser origins; default local Angular origins. |
| `FIREBASE_PROJECT_ID` | Required in Firebase mode. |
| `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | Optional paired Admin credentials. |

The API needs the private RPC URL/signing key, not database configuration.
App-local dotenv files are not the root Compose `.env`.

`pnpm --filter api dev` starts watch mode. `build`, `typecheck` and `test` are also
available. Public auth procedures are `auth.config` and `auth.loginMock`; all
others require a verified bearer. Mock login uses `demo@lazyfinance.cl` /
`password` only after an explicit persistence demo seed. The SSR cookie is not
accepted directly as API authentication.

## Contracts and checks

`libs/rpc-api` contains committed generated router types with public schemas from
`libs/contracts`. Run `pnpm rpc:generate` after changing routers and `pnpm rpc:check`
to detect drift. Normal application builds need neither generation nor another
application's source. The browser must never import private contracts/signing code.

Feature services inject the single `PersistenceClient` and call its inferred
`user(userId)` RPC surface directly. There are no per-domain persistence adapters
or database-shaped Date conversions. Financial calculations stay in the owning
service or shared pure domain helpers, not in transport wrappers.

Follow the [persistence read pattern](../../docs/technical/persistence-reads.md):
joined objective/tag reads, SQL sums for API-computed budget windows, narrow
income reads and snapshot-local rule/expectation indexes. Do not fetch full
collections just to join IDs or sum raw movements in a feature service.

Public bodies are limited to 1 MiB and batches to 10 procedures. Private provider
runs are bounded by 100 pages, 50,000 records, 32 MiB normalized JSON and 64 MiB
prepared JSON/results. Oversized runs fail without partial writes/checkpoint
advancement; they are never silently split into independent commits. The private
`providerSync.facts` and `objectives.spending` queries use POST method override
for large key/window lists;
ordinary empty queries remain GET. The private client deadline is 120 seconds.

Unit tests stay beside their implementation in `src/**/*.spec.ts`; run only those
with `pnpm --filter api exec vitest run src`. Integration suites live in
`tests/integration/<feature>/*.integration.spec.ts`, shared fixtures in
`tests/fixtures/`, and app-wide test setup in `tests/setup.ts`. App builds exclude
`tests/`; typechecks and default Vitest discovery include the relocated tests.

Service/helper unit tests can use mocked dependencies without listeners.
HTTP/RPC/MCP integration tests can run without real persistence, but Supertest
can open ephemeral HTTP listeners; the full API suite is **not serverless-only**.
DB/workflow cases skip without the owner fixture URL and a matching private test
service environment. Choose the
[verification tier](../../docs/technical/development-workflow.md#verification-tiers)
appropriate to the session.

For service-starting integration checks, first provide a disposable PostgreSQL 18
database ending in `_test`. From the root (placeholder URL):

```sh
TEST_POSTGRES_OWNER_URL=postgresql://owner:password@localhost:5432/lazyfinance_test pnpm test:integration
```

The runner builds dependencies, migrates/provisions, starts compiled persistence
with restricted runtime credentials and ephemeral keys, runs API tests through
both real HTTP boundaries, then stops that service. Owner SQL is confined to
`apps/api/tests/fixtures` tooling. It is not available to the API application/image.
Live Firebase verification additionally requires `TEST_FIREBASE_ID_TOKEN_A/B` and
optionally `TEST_FIREBASE_PROJECT_ID` / `TEST_FIREBASE_EXPIRED_ID_TOKEN`.
