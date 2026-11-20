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
| API | `PERSISTENCE_RPC_URL`, `PERSISTENCE_RPC_PRIVATE_KEY`, matching key ID; auth/CORS settings; `PORT` default `3000`; optional banking timer |
| Headless banking host | Same signed private-RPC and matching-mode Fintoc configuration; `BANKING_AUTOMATIC_SYNC_ENABLED`; no HTTP listener or database URL |
| UI static host | Nginx on `4000`; no Node rendering environment, database or service-signing credentials |
| Browser build | `apps/ui/src/environments/environment*.ts`: public API URL and public Firebase Web identifiers, never Admin/signing keys |

Fintoc configuration is optional and API-only: configure matched-mode `FINTOC_PUBLIC_KEY`
and `FINTOC_SECRET_KEY` together with a stable `FINTOC_TOKEN_ENCRYPTION_KEY` (64 hex
characters / 32 bytes). Do not put keys or raw Link Tokens in Git, UI builds,
connection metadata or logs. Apply migration 025 before enabling the lifecycle
RPC; keep the encryption key separately backed up. The API's explicit
`banking.importInitial` and `banking.refresh` commands import available snapshots;
`banking.syncStatus` reports durable attempt recovery and bank-source age. Apply
migrations 026 and 030 before running the current banking backend; they do not
reset data. Migration 030 adds selection/scheduling/admission/backoff records and
run-version/claim fields, leaving existing connections unconfirmed/unenrolled.
Bank-forced refresh remains out of scope. **Mi cuenta → Conexiones bancarias**
(`/conexiones-bancarias`) supports authorization, access checks, relink and disconnect
without implicitly importing financial data. Its **Datos y sincronización** panel
offers explicit account discovery/selection, initial import, repeat snapshot import
and readonly status checks. Discovery discards balances and raw account numbers,
retaining only bounded supported-product choices and last-four number suffixes.
Confirm a nonempty owned versioned selection before importing; unselected/new
accounts never import. Empty selection pauses local ingestion, not provider access
or billing. Deselecting preserves financial history and aliases; `account.active`
is independent. Account state reports tracked/paused/disconnected last-known facts.
Movement requests start at that connection's first-link Santiago day, not the
preceding 90 days. Relink preserves the date; a new connection after terminal
disconnect starts a new period. Earlier same-day movements may appear because the
provider does not supply a reliable exact-time cutoff. Previously imported older
records are not removed; no historical-import option is currently available.
An uncertain response requires checking status before another attempt; closing the
panel does not undo server work. `/cuentas` retains stored balances and links to
those settings. See the [Fintoc linking guide](../../apps/api/src/banking/linking/README.md)
and [first-import mapping/limits](../../apps/api/src/banking/fintoc/README.md).

### Optional automatic available-data imports

`BANKING_AUTOMATIC_SYNC_ENABLED=false` is the API/root Compose default. Enable only
after reviewing the organization's Movements entitlement, actual source-update
cadence, institution limits and acceptable Link/volume cost. This switch enables
local reads of data already available at Fintoc; it neither forces bank refresh
nor changes upstream collection/billing. Matching-mode Fintoc configuration and
explicit per-connection selection/enrollment remain required.

The API composes the timer. For a headless host, build dependencies/API and run
the same scheduling module with the intended process environment:

```sh
pnpm exec turbo build --filter=api...
pnpm --filter api worker:banking
```

Supply `PERSISTENCE_RPC_URL`, private signing key/matching key ID, the three stable
Fintoc settings and `BANKING_AUTOMATIC_SYNC_ENABLED=true`; never owner/runtime DB
credentials. It opens no HTTP listener or pool and does not initialize `AppModule`,
Firebase, MCP or assistant. The common environment schema still validates configured
values. Root Compose passes the switch to the API; it does not create a separately
reviewed worker service. App-local dotenv and root Compose environments remain
independent. Do not edit or rotate live keys merely to try the worker.

Prefer one intended hosting topology operationally, but duplicate API/headless
replicas are safe through durable database claims, not process-local exclusion.
Each host wakes immediately, then 60 seconds after a bounded invocation settles;
each invocation claims at most one due connection. One background run is reserved
globally, with due ordering and `FOR UPDATE SKIP LOCKED`. Claim and ingestion lease
are five minutes and must match on completion. Daily-quota deferral releases its
claim and advances due time; other early deferrals/abandoned claims remain bounded
by expiry. Missed intervals coalesce, not replay as a backlog. Success schedules
one hour plus 0–5 minutes jitter independently of bank-source age.

Operational limits are code-owned defaults, not adjustable environment quotas:
two starts/second and two in-flight Fintoc requests globally, 1,000 sync/discovery
reads per mode per rolling hour, and 30 acquired starts per connection per rolling
24 hours across manual/automatic work. Lifecycle calls share rate/concurrency but
not the read quota. Request permits last 25 seconds; admission consumes the
20-second request/60-second fetch deadlines. Provider per-mode `Retry-After` and
connection discovery/read waits are durable across restarts. Discovery failure
uses provider retry time or five minutes when absent. Read/attempt quota exhaustion
does not call Fintoc; selection/relink/restart do not reset attempt history.

Retryable run failures schedule 5/15/60/360-minute backoff plus up to one minute
jitter, never earlier than a provider wait. Five consecutive failures pause
automation; invalid data, unavailable selected accounts and expired/revoked access
also pause it. Investigate configuration/entitlement/data or restore owned access,
then use a successful explicit recovery to clear failure state. A selection toggle
is not a way to clear investigation pauses. Lost responses require stored-status
reconciliation, never mutation replay. Disable the switch on all intended hosts
and restart/redeploy those processes to stop new automatic claims/begins; drain
or shut down bounded existing runs. Environment values are loaded per process,
not hot-reloaded when a dotenv file changes.
Disablement does not undo committed data, erase enrollment or stop Fintoc billing.

Keep access, selection/enrollment, worker activity, last successful import and
source balance time separate when diagnosing “not updating.” Freshness is unknown
without a known value/reliable source date, stale at 24 hours, and is not made
fresh by another successful import. Current regression runs, manual/browser
acceptance, live entitlement/cost/billing and real source freshness are not
verified by this documentation change.

`BankingSyncModule` is reusable without the timer/public routers; manual and worker
entry points share the same ingestion, preparation and atomic persistence path.
Future service extraction must move that cohesive implementation/tests and replace
composition/transport rather than duplicate logic or import another app's source.
Before a distinct deployment, review separate signing authority, credential
distribution and private networking. Current purpose-restricted claims/transport
contexts do not remove the API signer's trusted user-assertion authority.

App-local dotenv files are independent of root Compose `.env`. See
[`apps/api/.env.example`](../../apps/api/.env.example),
[`apps/persistence/.env.example`](../../apps/persistence/.env.example), and
[root Compose example](../../.env.example). Keep owner CLI credentials separate
from the app runtimes; persistence requires a restricted runtime login.
`pnpm rpc:keys` prints a fresh pair; private key only to API, public key only to
persistence. Do not commit the output.

External MCP OAuth is optional but has **no application-token fallback**. Apply
migration 027 to the explicitly chosen database, generate separate stable secrets
with `pnpm mcp:keys`, and configure API-only `MCP_OAUTH_ISSUER`,
`MCP_OAUTH_UI_ORIGIN`, `MCP_OAUTH_STATE_KEY`, `MCP_OAUTH_JWKS` together. Use canonical
origins and a same-site UI/API deployment for signed interaction cookies. HTTPS
is mandatory in production; `MCP_OAUTH_TRUST_PROXY` is only for a trusted,
header-sanitizing TLS edge. Setup, client registration, rate limits, key recovery
and the deliberately refused destructive migration rollback are covered in the
[MCP operations guide](mcp-authorization.md#configuration-and-operations).

First-party chat defaults to `ASSISTANT_PROVIDER=disabled`. After explicitly
choosing the target database and applying all migrations, configure only the API
with a supported provider and explicit model/key, or a trusted compatible endpoint.
`demo` is labelled offline development mode and is rejected in production.
No banking/OAuth keys are reused or exposed to the UI. Proxies must permit
incremental NDJSON at `POST /assistant/turns`; provider cost/retention controls and
live-model quality need separate validation. See the
[assistant setup, limits and evaluation guide](financial-assistant.md).

Live voice separately defaults to `ASSISTANT_VOICE_ENABLED=false`. Direct API and
Compose examples pass that switch plus an explicit `ASSISTANT_VOICE_MODEL` and
dedicated server-only `ASSISTANT_VOICE_API_KEY`. Enable only on a **single API
replica**, with a separately authorized provider project/spend limit and browser
microphone/live evaluation. Admission and unresolved hangup recovery are in memory;
restart/crash resets them. A five-minute local session timer is not a guaranteed
remote lifetime or currency-denominated budget. Keep text available when voice
fails and investigate unconfirmed shutdown warnings through the provider project.
See the [voice transport, privacy and operational limits](assistant-live-voice.md).
`ASSISTANT_VOICE_NAME=marin` is the default timbre; `cedar` is also supported.
Changing it affects new calls only. The prompt requests neutral Spanish without
regional slang; pronunciation is guidance, not a guaranteed provider preset.
Evaluate clarity and naturalness by listening before choosing a deployment voice.
Separate input speech-to-text is intentionally unwired to avoid its additional
charge. Native audio still incurs provider cost; output metadata is transiently
checked for grounding, not saved as speech text. There is no transcription replay
or automatic retry. Existing stored transcripts are unchanged.
`ASSISTANT_VOICE_MAX_STARTS_PER_HOUR` optionally overrides the owner/hour start
ceiling (1–60): default 3 in production, 12 elsewhere. Capacity and hourly rejections
return typed problems plus `Retry-After`; investigate the safe operational category
instead of treating every failed start as a dropped connection. Do not log raw
provider errors, SDP, credentials, financial data or spoken text.

Migration 029 adds financial proposals/receipts; migration 027 directly defines
the final MCP scope constraint for this clean development baseline. Apply all
migrations to a fresh database before starting. Resetting an existing development
database requires explicit authorization for that target, not automatic startup
cleanup or compatibility migration code. First-party
chat requires exact saved-proposal approval; MCP can directly execute bounded
commands only with separately selected write scopes. Chat deletion does not remove
durable receipts or undo finance; action retention has no automatic purge.

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

Business calls use tRPC under `/trpc`: `config.get`, `auth.loginMock`,
`auth.principal`, accounts, transactions, objectives/progress, summaries, income,
tags and rules. The checked-in [public generated router](../../libs/rpc-api/src/generated/server.ts)
is the procedure inventory. Business REST routes were retired. `/mcp` exposes
fourteen financial/supporting reads plus preview/direct-execution tools through
the same services, with separately granted write permissions. It requires a separate
OAuth client grant, not a Firebase/development app bearer. Discovery/protocol and
cookie-bound interaction routes are HTTP; grant settings use authenticated
`mcpAccess` RPC. Mock login uses `demo@lazyfinance.cl` / `password` only in development
after seeding. Production mode requires real Firebase configuration.

The liveness routes confirm a listening application, not an end-to-end provider,
Firebase, database query or backup-recovery readiness check. Private procedures
require service assertions even on loopback. Browser access is accepted only after
API verification; an old application cookie is expired, not adopted as identity.

## Compose

**Deployment is pending.** These checked-in files describe supported local
packaging/reference topologies, not a currently deployed production environment.
The [physical architecture view](../diagrams/README.md#physical-view--deployment-pending)
maps their containers, networks, ports and remaining deployment decisions.

- `resources.yml`: local PostgreSQL on loopback port 5432; no named durable volume.
- `apps.yml`: apps plus owner-only init job using the external `lazyfinance`
  resources network. Start resources first; only persistence/init/seed join that
  database network, with API/UI on separate service/edge networks.
- `deploy.yml`: separate data/service/edge networks, named PostgreSQL volume,
  owner-only init job, private persistence, API and static UI. No
  database/persistence published ports. Copy root `.env.example`, set
  keys/runtime/demo-tools passwords, then run
  `pnpm deploy:local:up`.
- `docker/dev/compose.yml`: development deployment topology with Traefik HTTPS,
  PostgreSQL on a named volume, private persistence, API and static UI. Only ports
  80/443 are published; the API and database are not directly
  published.
- Initial fixed-mock demo data is opt-in:
  `pnpm deploy:local --profile tools run --rm seed`. The in-app **Preparar demo**
  action is a confirmed reset-and-reseed of only the signed-in user's
  finance and assistant data; it is never invoked at startup or during deployment.
  Migrations/provisioning are init-job work, never runtime startup side effects.

The local deployment uses development defaults. Production TLS, secret management,
key rotation, backups and public OAuth abuse controls remain operator work.
Browser API URLs remain environment-specific build configuration. Change
`CORS_ORIGINS` to allow the actual UI origin in each environment.

### Development deployment

`.github/workflows/main-branch-deploy.yml` runs on pushes to `main` (and supports
manual dispatch). It rebuilds only changed app images unless shared build inputs
change, then deploys the `latest` images from Docker Hub. The image repositories are
`igperalta/lazyfinance-api`, `igperalta/lazyfinance-persistence` and
`igperalta/lazyfinance-ui`. The UI uses its checked-in production API URL,
`https://api.lazyfinance.online`, and Compose routes that same hostname to the API.
There is no extra Angular environment or build configuration for demo tools. The
same UI build shows their menu entry only when the API reports
`config.get.demoTools.enabled=true`. The API and persistence each require an
explicit `DEMO_TOOLS_ENABLED=true` environment variable.

Configure this repository variable for Docker Hub image publishing:

| Repository variable | Requirement |
| --- | --- |
| `DOCKER_USERNAME` | Optional; defaults to `igperalta` |

Add the `DOCKER_PASSWORD` registry credential as a repository secret. Configure a
GitHub Actions environment named `development` with these deployment variables:

| Variable | Requirement |
| --- | --- |
| `WEB_DOMAIN` | Required UI hostname, with DNS pointing to the deployment host |
| `ACME_EMAIL` | Required email for Traefik/Let's Encrypt certificate requests |
| `POSTGRES_USER`, `POSTGRES_DB` | Optional; default to `lazyfinance_owner` and `lazyfinance` |
| `PERSISTENCE_DATABASE_USER`, `PERSISTENCE_RPC_KEY_ID` | Optional; default to `lazyfinance_app` and `primary` |
| `DEMO_TOOLS_DATABASE_USER` | Optional; defaults to the dedicated `lazyfinance_demo_tools` login |
| `FIREBASE_PROJECT_ID` | Optional; defaults to `lazyfinance-dev`, matching the checked-in UI configuration |
| `ASSISTANT_PROVIDER`, `ASSISTANT_MODEL` | Configured text assistant provider and model |
| `ASSISTANT_VOICE_ENABLED`, `ASSISTANT_VOICE_MODEL`, `ASSISTANT_VOICE_NAME` | Voice settings; voice is billable and defaults to `marin` |
| `FINTOC_PUBLIC_KEY` | Fintoc publishable key; its mode must match the secret key |
| `MCP_OAUTH_ISSUER`, `MCP_OAUTH_UI_ORIGIN` | Public API/UI origins; must match the deployed domains |
| `MCP_OAUTH_TRUST_PROXY` | `true` only because Traefik terminates TLS and replaces forwarded headers |

Required `development` environment secrets are `POSTGRES_PASSWORD`,
`PERSISTENCE_DATABASE_PASSWORD`, `DEMO_TOOLS_DATABASE_PASSWORD`,
`PERSISTENCE_RPC_PRIVATE_KEY` and
`PERSISTENCE_RPC_PUBLIC_KEY`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`,
`ASSISTANT_API_KEY`, `ASSISTANT_VOICE_API_KEY`, `FINTOC_SECRET_KEY`,
`FINTOC_TOKEN_ENCRYPTION_KEY`, `MCP_OAUTH_STATE_KEY` and `MCP_OAUTH_JWKS`.
Generate the matching RPC signing pair with
`pnpm rpc:keys`; the private key is passed only to API and the public key only to
persistence. Keep provider credentials, Firebase private key, OAuth state key and
private JWKS signing material in Actions secrets. Use URL-safe owner/runtime
database passwords because Compose constructs PostgreSQL URLs from these values;
use a 16+-character runtime password and 24+-character demo-tools password. The
owner-only init job receives the demo-tools password for provisioning; the enabled
development persistence container receives the login URL, never API. The init job
provisions its `BYPASSRLS` role with scoped
finance/assistant grants and provider catalog reads; it has no identity or MCP
grant/artifact access. Automatic banking sync is explicitly kept
disabled in Compose, even though Fintoc credentials are configured. The configured
Fintoc key pair is test-mode; replace both keys together before testing against
live banking connections.
Image builds and change detection run on GitHub-hosted `ubuntu-latest` runners.
The deploy runner needs Docker Compose and must match
`[self-hosted, deploy, development]`. Keep it pinned to the host that owns this
stack's Docker volumes. Ports 80/443 must be reachable for
Traefik and ACME TLS challenges. The `api.lazyfinance.online` DNS record must also
point to this host; it is the API origin already embedded in the UI source.

The workflow starts PostgreSQL, runs the owner-only migration/provision CLI, and
then starts persistence/API/UI. It does not seed or reset user data on
deployment. Manual dispatch is
restricted to the `main` ref. Owner credentials are passed only to PostgreSQL
initialization and one-shot CLI jobs, not to running application containers. The
API verifies the Firebase bearer and passes a signed internal user context to
persistence; no target user ID is accepted from the UI. Reset is atomic, leaves
every identity row including MCP grants untouched,
and deletes assistant action receipts without reversing their historical financial
effects. The named
database volume is preserved by ordinary Compose updates; never add `down
--volumes` or reset it as a deployment recovery shortcut. This is a development
deployment, not a production backup, recovery, secret-rotation or release-hardening
plan.

For a manual deployment from a machine with Docker Compose, copy
`docker/dev/.env.example` to `docker/dev/.env`, set real domains/credentials and
generate the RPC key pair, then use:

```sh
docker compose --env-file docker/dev/.env -f docker/dev/compose.yml build
docker compose --env-file docker/dev/.env -f docker/dev/compose.yml up -d --wait traefik postgres
docker compose --env-file docker/dev/.env -f docker/dev/compose.yml up init
docker compose --env-file docker/dev/.env -f docker/dev/compose.yml up -d --wait persistence api ui
```

To stop services without deleting stored data, run the same Compose command with
`down` and do not pass `--volumes`.

### Browser and static hosting destinations

`apps/ui/src/environments/environment.development.ts` embeds
`http://localhost:3000`; `environment.ts` embeds `https://api.lazyfinance.online`.
`RpcClient` appends `/trpc` to the selected API base, without an extra `/api` prefix
or UI-host proxy. The API's `CORS_ORIGINS` must include the actual browser UI origin.
Static startup and the public landing do not wait for API health or database readiness.
The API remains directly exposed on its configured port for API/MCP consumers.
There is no `API_INTERNAL_URL` or request-time Angular server.

The UI discovers demo-tools availability from `config.get` after browser startup,
not a special build. It sends the confirmed mutation through the existing API RPC
client with its accepted bearer. API and persistence both gate the feature with
`DEMO_TOOLS_ENABLED=true`. Only persistence receives the privileged database URL;
it does not create that connection when the flag is absent or false.

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
- Empty local mock account: run the explicit initial CLI seed once. Firebase users
  provision their own identity and can use the development-only confirmed reset
  action to create their own demo fixtures.
- Browser/API failure: check the selected environment's API base URL, browser
  reachability/TLS, API port and allowed CORS origin. The neutral
  frame must remain available during an API outage; session failure offers retry.
- Firebase failures: verify Web/Admin project IDs, Google/Email-Password provider
  and authorized-domain setup, email templates, token audience/issuer and paired
  optional Admin credentials. A credential collision is not permission to merge
  UIDs or delete either account; use the existing method and explicit linking.
- MCP 401: discover and authorize with OAuth; do not copy a Firebase/development
  app token. Check the exact issuer/resource, scope, grant expiry/revocation and
  stable OAuth keys. A 421 means the effective Host/protocol is not the configured
  issuer; fix proxy/URL configuration rather than trusting arbitrary headers.
- Consent unavailable: check the original browser, same-site API/UI hosts,
  credentialed interaction CORS and the ten-minute interaction lifetime. After an
  uncertain decision, inspect connected apps instead of automatically approving again.
  If no `/oauth/interaction/…/details` request is sent and the resource error says
  `Cannot read properties of undefined (reading 'parse')`, the UI may be serving
  stale workspace contracts. Rebuild UI dependencies, restart the UI task and
  reload the browser. The dev-server prebundle exclusion prevents this cache from
  freezing contract exports; do not rotate keys or reset a database to fix it.
- Assistant processing consent unavailable: apply additive migration 032 to the
  authorized database with the owner-only migration CLI. Never reset or reseed to
  add this preference. Failed/uncertain saves require **Comprobar decisión guardada**,
  not another automatic mutation. This account decision is separate from external
  MCP/OAuth consent and never grants microphone access by itself.
- Oversized provider run: limits are 100 pages/50,000 records plus 32 MiB normalized
  and 64 MiB private JSON. It fails atomically, not as partial financial writes.
- A failed/ambiguous mutation is not automatically retried. Only an explicit
  stale-input rejection can be read/prepared again safely.
