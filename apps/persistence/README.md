# Persistence

Private NestJS/tRPC service using Kysely, `pg`, `identity`/`finance`/`assistant` schemas and
PostgreSQL scoped RLS. The API and UI now use the matching RPC boundaries; no API
database fallback remains. Its 106 private procedures expose identity resolution,
bounded financial facts, revisioned budget/income commands, expense-adjustment
allocations, tag decisions/rules, owned onboarding/banking lifecycle and prepared
atomic provider sync, plus purpose-isolated OAuth artifacts, owned grants and
bounded server-owned assistant conversations, account processing consent and atomic financial-action receipts.
Selected-account imports add owner-bound selection/schedules and purpose-isolated
background claims/provider admission; they reuse the existing atomic ingestion.
Product calculations and OAuth cryptography/protocol remain in the API. Read the
[private RPC/RLS reference](../../docs/technical/persistence-security.md),
[implemented schema/ERD](../../docs/technical/database-model.md) and
[contract workflow](../../docs/technical/rpc-contracts.md).

## Fresh migrations and separate database credentials

Use a **new empty database** for this implementation. There is no old-Drizzle
history import or data-upgrade path, and the CLI never resets an existing database.
Do not point it at the old application's database expecting a migration bridge.

Migrations are small, globally ordered across schema folders, and run through
Kysely's PostgreSQL transaction/lock handling. Each table migration creates its
constraints, indexes, policies and grants together. A failed migration does not
leave a half-protected table or a successful ledger entry.

1. Build shared libraries: `pnpm exec turbo build --filter=persistence^...`.
2. Supply `POSTGRES_MIGRATION_URL` **only to CLI commands**, using a database
   owner capable of creating the required roles/schemas:

   ```sh
   pnpm --filter persistence db:migrate
   ```

3. Set `PERSISTENCE_DATABASE_USER` and `PERSISTENCE_DATABASE_PASSWORD` (16+
   characters) in that CLI environment, then run:

   ```sh
   pnpm --filter persistence db:provision-runtime
   ```

The provision command creates a distinct LOGIN inheriting the NOLOGIN
`lazyfinance_runtime` permission role. Existing managed logins are verified, not
silently changed or password-rotated. Unsafe/unmanaged collisions are refused.
`lazyfinance_identity_bootstrap` is a separate restricted NOLOGIN function owner,
not a financial-data bypass or a login credential.

4. Generate keys with `pnpm rpc:keys`. Put the private key **only in the API**
   environment and the public key in persistence. Keys/secrets must not enter Git.
5. Start persistence with `POSTGRES_RUNTIME_URL` using the provisioned login and
   **without `POSTGRES_MIGRATION_URL`**. Startup rejects owner/BYPASSRLS credentials.

Optionally run `pnpm --filter persistence db:seed` with **CLI-only** owner credentials
to create/update the stable demo fixtures. Seeding is not automatic. The compiled
image includes `node dist/database/cli.js migrate|provision|seed`; the runtime never
receives the owner URL. Do not source the root Compose `.env` into app processes.

`pnpm --filter persistence dev` listens on `127.0.0.1:3001` by default. Only an
authenticated service may call `/trpc`; do not publish it to browsers. Use a
protected/TLS service channel in deployment.

## Boundaries

- Migration 032 adds one account-owned processing-consent decision with policy key,
  CAS revision and server timestamp. Reads never insert, unchanged decisions keep
  time/revision, and forced owner RLS permits no deletion/reassignment. Apply this
  additive migration to an authorized current database without resetting/reseeding.
- Migration 031 additively retains each newly approved MCP grant's callback;
  historical grants remain nullable rather than receiving invented metadata.
- Migration 030 adds versioned account selection, due-work schedules, request
  admission and provider-mode backoff. Existing links start unconfirmed/unenrolled.
  Deselect/disconnect invalidates work without deleting imported history or aliases.
  Scheduler/transport contexts cannot read financial facts or credentials, change
  selection or impersonate users. Row/claim/version checks and global transaction
  locks serialize capacity admission with claim extension. Provider calls remain
  outside transactions. See the [banking boundary](../api/src/banking/README.md).

- Migration 029 adds owner-RLS `assistant.action` and immutable finalized receipts.
  The clean MCP grant definition in migration 027 includes the full scope allowlist;
  it does not need an action-era constraint replacement. Named commands
  recheck version/expiry/fingerprints or the explicit MCP write grant, then execute
  existing domain commands and save the receipt in one transaction. Chat deletion
  does not undo financial changes or remove receipts. Runtime cannot delete ledger
  records; storage is capped at 10,000 per owner, without automatic receipt purge.
  This unreleased baseline targets fresh databases, not upgrades from earlier
  development iterations. Any reset must explicitly identify its disposable target;
  runtime and migration startup never reset data automatically.

- Migration 028 creates the dedicated `assistant` schema and owner-RLS conversation
  table. Claims, quotas and lease-checked completion are short atomic commands;
  model calls remain in the API, outside transactions. It does not change financial
  tables or seed data and refuses destructive rollback. See
  [assistant retention and recovery](../../docs/technical/financial-assistant.md).

- Migration 027 adds encrypted OAuth-artifact storage and owner-bound grants, not
  financial data changes. The dedicated `mcp-authorization` context can call only
  the six `mcpArtifacts` procedures; it has no financial/profile access or owner
  assertion. User-scoped binding checks provider ownership. Consumption/replay and
  revocation commit atomically; runtime cannot undo revocation. It deliberately
  refuses destructive `down`. See the [OAuth operations guide](../../docs/technical/mcp-authorization.md).

- Migration 025 adds owned Fintoc Link Intent claims, stable provider references,
  encrypted credentials and lifecycle versions. Provider calls/encryption remain
  in the API; disconnect disables access before remote cleanup and preserves
  financial history. See the [linking guide](../api/src/banking/linking/README.md).
- `identity.onboarding` stores explicit skip/completion per internal user. Reads
  default to active without inserting; the atomic finish upsert preserves terminal
  completion and its first server timestamp. Self-owned RLS and column-limited
  grants permit no delete/reassignment or profile writes. Apply migration 024 to
  an existing current-schema database; no reseed or data reset is needed.
- Follow the [purpose-shaped read pattern](../../docs/technical/persistence-reads.md):
  joins/projections and factual SQL sums belong here; API calendar/financial
  interpretation must not be copied into a second implementation.
- Only migration/seed tooling receives owner credentials.
- Feature repositories inject `RLS_DB`, which fails outside a scoped transaction.
- Each RPC verifies its signed user/bootstrap/OAuth/scheduler/transport purpose
  before opening a transaction.
- `set_config(..., true)` sets user context locally; pool reuse cannot retain it.
- Context kind and procedure metadata are default-deny. Bootstrap can call only
  `identity.resolve`, and its function owner has no finance-schema access.
- tRPC error results and output-validation failures throw inside the transaction
  callback so failed operations cannot commit partial writes.
- Monetary `numeric` values remain strings; do not globally parse them as Number.
- Standard router decorators and explicit shared schemas generate the type-only
  `@lazyfinance/rpc-persistence` package without application imports.
- All user mutations share a short per-user advisory transaction lock. Prepared
  decisions/sync commands recheck a canonical factual fingerprint under that lock;
  provider calls/classification/money arithmetic remain outside SQL in the API.
- Sync facts, tombstones, conflicts, tag decisions/events and checkpoint commit
  together. Failure recording never advances the last-good checkpoint.
- Private bodies/results are limited to 64 MiB, with one procedure per request.
  Provider runs also have API-side 32 MiB normalized / 50,000-record / 100-page
  bounds. Oversized runs fail atomically, never as silently split commits.
- Request deadlines are 120s; PostgreSQL statement/lock/idle/whole-transaction
  budgets are 20s/5s/10s/100s. Run PostgreSQL 18 as declared by Compose.

## Validation

The [verification guide](../../docs/technical/development-workflow.md#verification-tiers)
separates serverless unit checks from listener/DB integration. The commands below
are a general workflow, not a serverless-only promise when DB tests are configured.

Unit tests stay beside their implementation in `src/**/*.spec.ts`; run only those
with `pnpm --filter persistence exec vitest run src`. Real PostgreSQL/RPC tests
live in `tests/integration/*.integration.spec.ts`, with suite-specific fixtures
kept in the suite. App builds exclude `tests/`; typechecks and default Vitest
discovery include the relocated tests.

```sh
pnpm rpc:generate
pnpm rpc:check
pnpm exec turbo build --filter=persistence...
pnpm --filter persistence typecheck
pnpm --filter persistence test
```

Database integration tests require `TEST_POSTGRES_OWNER_URL` pointing to a
**disposable database whose name ends in `_test`**. They create test-owned rows
and provision a separate runtime login. Without that variable, database tests
are explicitly skipped; unit tests still run. Never use real user data.

Configured PostgreSQL integration tests open test HTTP listeners. The root
`pnpm test:integration` runner separately runs the **API** suite against compiled
persistence; it does not replace this persistence suite or start PostgreSQL for you.

Integration coverage includes every sensitive table's isolation, forged related
IDs, runtime-role safety, concurrent/pool-reused users, identity concurrency/email
collisions, failed migration rollback, and resolver/output-validation rollback.
