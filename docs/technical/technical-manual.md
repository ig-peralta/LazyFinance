# Technical manual — installation, operation and boundaries

Current implementation: [three-application architecture](architecture.md),
[persistence/RLS design](../planning/persistence-rpc-user-rls-plan.md).

## Requirements and setup

Node 22.22.3+ or supported 24.x, pnpm 9, Docker/Compose and PostgreSQL 18. Install
from the monorepo root with `pnpm install`. Follow [root setup](../../README.md#run-locally)
and the [persistence guide](../../apps/persistence/README.md) to initialize a
**fresh empty** database, provision a separate runtime login, explicitly seed if
desired, and generate a fresh service key pair.

There is no old-Drizzle history/data adoption and no automatic reset. An existing
resources container may still have only the old `postgres` database: create a
separate `lazyfinance` database explicitly instead of migrating the old one.
Never delete an existing volume to fix a migration error without a chosen recovery
plan. Migration files create their table/types/constraints/indexes/grants/RLS
together transactionally; use only the Kysely runner.

## Environments

| Process | Allowed sensitive configuration |
| --- | --- |
| Owner CLI/init/seed | `POSTGRES_MIGRATION_URL`; runtime login/password only for provisioning |
| Persistence | `POSTGRES_RUNTIME_URL`, `PERSISTENCE_RPC_PUBLIC_KEY`, matching key ID |
| API | `PERSISTENCE_RPC_URL`, signing private key/key ID, Firebase Admin configuration if used |
| UI SSR | `API_INTERNAL_URL`; no database or service-signing credentials |

App-local dotenv files are independent of root Compose `.env`. See
[`apps/api/.env.example`](../../apps/api/.env.example),
[`apps/persistence/.env.example`](../../apps/persistence/.env.example), and
[root Compose example](../../.env.example). Do not export owner credentials while
running `pnpm dev`: API and persistence reject inappropriate database credentials.
`pnpm rpc:keys` prints a fresh pair; private key only to API, public key only to
persistence. Do not commit the output.

## Run and inspect

`pnpm dev` starts UI `localhost:4200`, API `localhost:3000`, and private persistence
`127.0.0.1:3001`. Build shared dependencies first if running a workspace command
directly. `GET /` on API and `GET /health` on persistence are liveness endpoints,
not proof of every provider integration's readiness.

Business calls use tRPC under `/trpc`: `auth.config`, `auth.loginMock`,
`auth.principal`, accounts, transactions, objectives/progress, summaries, income,
tags and rules. The checked-in [public generated router](../../libs/rpc-api/src/generated/server.ts)
is the procedure inventory. Business REST routes were retired. `POST /mcp` retains
the same verified principal and read-only tools; external-client OAuth is not
implemented. Mock login uses `demo@lazyfinance.cl` / `password` only in development
after seeding. Production mode requires real Firebase configuration.

## Compose

- `resources.yml`: local PostgreSQL on loopback port 5432; no named durable volume.
- `apps.yml`: apps plus owner-only init job on the resources network.
- `deploy.yml`: separate data/service/edge networks, named PostgreSQL volume,
  owner-only init job, private persistence, API and SSR. No database/persistence
  published ports. Copy root `.env.example`, set keys/runtime password, then run
  `pnpm deploy:local:up`.
- Demo data is opt-in: `pnpm deploy:local --profile tools run --rm seed`.
  Migrations/provisioning are init-job work, never runtime startup side effects.

The local deployment uses development defaults. Production TLS, secret management,
key rotation, backups and independent client authorization remain operator work.
Browser API URLs are build-time UI configuration; `API_INTERNAL_URL` changes only
SSR transport. Change `CORS_ORIGINS` for a different browser origin.

## Verification and troubleshooting

Use `pnpm rpc:generate` after router changes, `pnpm rpc:check` for drift,
`pnpm check:architecture`, `pnpm build`, `pnpm typecheck`, and workspace tests.
`TEST_POSTGRES_OWNER_URL=... pnpm test:integration` starts compiled persistence
with a restricted runtime login and ephemeral keys, runs API workflow/public/MCP
tests, then stops that service. Targets must end in `_test`; without the variables
DB integration tests explicitly skip. No real user database is a test fixture.

- API unavailable: inspect persistence URL/reachability, service key pair/key ID,
  then runtime-role safety and migration state. Do not supply owner credentials
  to bypass RLS or restore direct API SQL.
- Empty demo: check that seeding was requested and the mock identity points to
  the seeded user. A token is not stored as a database user API key.
- Browser/SSR mismatch: check browser API URL, `API_INTERNAL_URL`, CORS, token-only
  cookie and `auth.principal`. SSR revalidates cookies; forged users are discarded.
- Firebase failures: verify Web/Admin project IDs, Google provider/domain setup,
  token audience/issuer and paired optional Admin credentials.
- Oversized provider run: limits are 100 pages/50,000 records plus 32 MiB normalized
  and 64 MiB private JSON. It fails atomically, not as partial financial writes.
- A failed/ambiguous mutation is not automatically retried. Only an explicit
  stale-input rejection can be read/prepared again safely.
