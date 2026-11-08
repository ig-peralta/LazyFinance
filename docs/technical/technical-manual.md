# Technical manual — installation, operation and boundaries

Current implementation: [three-application architecture](architecture.md),
[persistence/RLS security](persistence-security.md),
[database model](database-model.md), [RPC contracts](rpc-contracts.md).
For code changes, Biome and test tiers use the
[development guide](development-workflow.md).

## Requirements and setup

Node 22.22.3+ or 24.15.0+, pnpm 9, Docker/Compose and PostgreSQL 18. Install
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

The setup order is deliberate:

1. Install/build shared dependencies and choose the new database.
2. Run owner-only `db:migrate`, then `db:provision-runtime` with a distinct login
   and 16+-character runtime password. Existing managed passwords are not rotated.
3. Optionally run owner-only `db:seed` for demo data, not real financial data.
4. Generate a service key pair and configure the two separate app-local runtime
   environments. Remove owner credentials from the runtime shell/environment.
5. Start persistence, API and UI (or let the Compose init/dependency chain do so).

The persistence CLI scripts run TypeScript; its image also includes compiled
`node dist/database/cli.js migrate|provision|seed`. Migration/provision/seed jobs
are not service startup side effects. Runtime role checks are not bypassed by
using a database owner when setup fails.

## Environments

| Process | Configuration boundary |
| --- | --- |
| Owner CLI/init/seed | `POSTGRES_MIGRATION_URL`; `PERSISTENCE_DATABASE_USER` / `PERSISTENCE_DATABASE_PASSWORD` only for provisioning |
| Persistence | `POSTGRES_RUNTIME_URL`, `PERSISTENCE_RPC_PUBLIC_KEY`, matching key ID; `HOST` / `PORT` default to `127.0.0.1` / `3001` |
| API | `PERSISTENCE_RPC_URL`, `PERSISTENCE_RPC_PRIVATE_KEY`, matching key ID; auth/CORS settings; `PORT` default `3000` |
| UI static host | Nginx on `4000`; no Node rendering environment, database or service-signing credentials |
| Browser build | `apps/ui/src/environments/environment*.ts`: public API URL and public Firebase Web identifiers, never Admin/signing keys |

Fintoc configuration is optional and API-only: configure matched-mode `FINTOC_PUBLIC_KEY`
and `FINTOC_SECRET_KEY` together with a stable `FINTOC_TOKEN_ENCRYPTION_KEY` (64 hex
characters / 32 bytes). Do not put keys or raw Link Tokens in Git, UI builds,
connection metadata or logs. Apply migration 025 before enabling the lifecycle
RPC; keep the encryption key separately backed up. Provider financial imports and
refresh scheduling remain separate slices. **Mi cuenta → Conexiones bancarias**
(`/conexiones-bancarias`) supports authorization, access checks, relink and disconnect
without importing financial data. `/cuentas` retains stored balances and links to
those settings. See the [Fintoc linking guide](../../apps/api/src/banking/linking/README.md).

App-local dotenv files are independent of root Compose `.env`. See
[`apps/api/.env.example`](../../apps/api/.env.example),
[`apps/persistence/.env.example`](../../apps/persistence/.env.example), and
[root Compose example](../../.env.example). Keep owner CLI credentials separate
from the app runtimes; persistence requires a restricted runtime login.
`pnpm rpc:keys` prints a fresh pair; private key only to API, public key only to
persistence. Do not commit the output.

The `PERSISTENCE_RPC_URL` is the service base URL (the client appends `/trpc`).
PEMs in the example dotenv files use escaped newlines; replace placeholders with
the generated matching pair. These are service keys, not Firebase Admin keys or
user ID tokens. `AUTH_PROVIDER=mock` works only outside production and needs the
seeded existing identity; Firebase mode requires `FIREBASE_PROJECT_ID`. Optional
Admin email/private key must be supplied together. See
[identity configuration](identity.md#configuration-boundaries).

Dotenv loads relative to the process working directory. Prefer workspace commands
such as `pnpm --filter persistence dev` rather than invoking an app entrypoint
from a directory containing another process's `.env`. Root `.env` is for Compose
substitution; it is not a shared runtime secret bundle.

### Firebase browser setup

Before exercising real sign-in/linking in a project:

1. Match the UI's public Web identifiers to API `FIREBASE_PROJECT_ID` and select
   `AUTH_PROVIDER=firebase`. Never add Admin credentials to the browser bundle.
2. Enable **Google** and **Email/Password** in Firebase Authentication's sign-in
   providers. Email-link/passwordless sign-in is not this implementation.
3. Authorize the actual browser host, including local hosts explicitly when
   needed, and review the Google consent/support configuration. Popup-based
   Google sign-in/reauthentication/linking requires popups to be allowed; a mobile
   redirect fallback is not implemented.
4. Review email templates, sender settings and verification/reset action URLs.
   The app sends Firebase's standard emails; it does not implement a custom action
   handler or consume reset/verification codes itself. Users return to the login
   page to recheck verification or sign in with the reset password.
5. Enable email-enumeration protection and enforce an appropriate password policy
   (for example a 12+-character minimum). The form's six-character minimum is only
   a basic input constraint, not the deployed security policy. Review Firebase's
   account-per-email/trusted-provider behavior: LazyFinance never merges UIDs or
   moves data to work around credential collisions.
6. Using disposable accounts, verify password creation/email/reset, both linking
   directions, same UID/internal owner after signing in with either method,
   credential collisions and cancellation/logout. These are live-provider checks,
   not proven by compilation or mocked SDK specs. Check Firebase's current
   [account-linking guidance](https://firebase.google.com/docs/auth/web/account-linking)
   and its linked SDK issue if a project's credential linking fails.

The authenticated `/seguridad` page manages only same-UID Google/password methods.
It does not merge separately created Firebase users, change financial ownership,
unlink methods or add MFA. Adding password login provides another independent
access path, not Google MFA enforcement. See the
[full flow and security policy](identity.md#firebase-sign-in-and-credential-linking).
Changing code does not enable these Firebase Console settings automatically.

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

The liveness routes confirm a listening application, not an end-to-end provider,
Firebase, database query or backup-recovery readiness check. Private procedures
require service assertions even on loopback. Browser access is accepted only after
API verification; an old application cookie is expired, not adopted as identity.

## Compose

- `resources.yml`: local PostgreSQL on loopback port 5432; no named durable volume.
- `apps.yml`: apps plus owner-only init job using the external `lazyfinance`
  resources network. Start resources first; only persistence/init/seed join that
  database network, with API/UI on separate service/edge networks.
- `deploy.yml`: separate data/service/edge networks, named PostgreSQL volume,
  owner-only init job, private persistence, API and static UI. No database/persistence
  published ports. Copy root `.env.example`, set keys/runtime password, then run
  `pnpm deploy:local:up`.
- Demo data is opt-in: `pnpm deploy:local --profile tools run --rm seed`.
  Migrations/provisioning are init-job work, never runtime startup side effects.

The local deployment uses development defaults. Production TLS, secret management,
key rotation, backups and independent client authorization remain operator work.
Browser API URLs remain environment-specific build configuration. Change
`CORS_ORIGINS` to allow the actual UI origin in each environment.

### Browser and static hosting destinations

`apps/ui/src/environments/environment.development.ts` embeds
`http://localhost:3000`; `environment.ts` embeds `https://api.lazyfinance.cl`.
`RpcClient` appends `/trpc` to the selected API base, without an extra `/api` prefix
or UI-host proxy. The API's `CORS_ORIGINS` must include the actual browser UI origin.
Static startup and the public landing do not wait for API health or database readiness.
The API remains directly exposed on its configured port for API/MCP consumers.
There is no `API_INTERNAL_URL` or request-time Angular server.

The Docker UI uses the production environment too. For an entirely local browser
rehearsal, select a browser-reachable local API URL in the chosen Angular build
environment and rebuild the UI. `api:3000` is a Docker-only hostname, not a browser
destination. Changing `API_PORT` or CORS alone does not change a compiled API URL.

The browser output is `apps/ui/dist/ui/browser`: `index.html` contains the public
prerender, and `index.csr.html` is the neutral client entry for deep links. HTML is
revalidated, fingerprinted JS/CSS is immutable, and missing assets return 404 rather
than the client entry. Nginx gzip compresses supported assets. A different hosting
platform only needs equivalent static fallback/caching; the UI host has no API
upstream or Docker DNS dependency. Do not publish Angular's build-time server
artifacts as a runtime server.

UI Firebase Web project identifiers and API `FIREBASE_PROJECT_ID` must match.
The local Compose network and published ports are not a public-production TLS or
secret-management recipe.

Stopping a Compose stack is not a recovery plan. Preserve existing volumes and
databases; do not use `down --volumes` or remove a database to fix authentication,
unsafe-role, migration or key errors. Backups/restore rehearsal and role/key
rotation require explicit operator procedures not supplied by this local stack.

## Verification and troubleshooting

Use `pnpm rpc:generate` after router changes, `pnpm rpc:check` for drift,
`pnpm check:architecture`, `pnpm build` and `pnpm typecheck`. Tests have different
side effects: service/helper unit and UI in-memory tests can run serverlessly, but
HTTP/router/MCP tests may open ephemeral listeners even without external services.
Do not run `pnpm test` or the integration runner as a serverless-only check.

`TEST_POSTGRES_OWNER_URL=... pnpm test:integration` requires an already available
disposable database ending in `_test`. It builds/migrates/provisions, starts
compiled persistence with a restricted runtime login and ephemeral keys, runs
the API suite through public/private RPC, then stops that child service. It does
not create PostgreSQL or reset/drop the database. Without integration variables
the individual DB specs skip; the runner itself requires its owner URL. Use the
[verification matrix](development-workflow.md#verification-tiers) for commands,
fixture safety and live-Firebase distinctions. No real user database is a fixture.

- API unavailable: inspect persistence URL/reachability, service key pair/key ID,
  then runtime-role safety and migration state. Do not supply owner credentials
  to bypass RLS or restore direct API SQL.
- Empty demo: check that seeding was requested and the mock identity points to
  the seeded user. A token is not stored as a database user API key.
- Browser/API failure: check the selected environment's API base URL, browser
  reachability/TLS, API port and allowed CORS origin. The neutral
  frame must remain available during an API outage; session failure offers retry.
- Firebase failures: verify Web/Admin project IDs, Google/Email-Password provider
  and authorized-domain setup, email templates, token audience/issuer and paired
  optional Admin credentials. A credential collision is not permission to merge
  UIDs or delete either account; use the existing method and explicit linking.
- Oversized provider run: limits are 100 pages/50,000 records plus 32 MiB normalized
  and 64 MiB private JSON. It fails atomically, not as partial financial writes.
- A failed/ambiguous mutation is not automatically retried. Only an explicit
  stale-input rejection can be read/prepared again safely.
