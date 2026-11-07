# Persistence

Private NestJS/tRPC service using Kysely, `pg`, `identity`/`finance` schemas and
PostgreSQL user RLS. The API and UI now use the matching RPC boundaries; no API
database fallback remains. Its 44 private procedures expose identity resolution,
bounded financial facts, revisioned budget/income commands, tag decisions/rules, and prepared atomic
provider sync. Product calculations remain in the API. Read the
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

- Follow the [purpose-shaped read pattern](../../docs/technical/persistence-reads.md):
  joins/projections and factual SQL sums belong here; API calendar/financial
  interpretation must not be copied into a second implementation.
- Only migration/seed tooling receives owner credentials.
- Feature repositories inject `RLS_DB`, which fails outside a scoped transaction.
- Each RPC verifies the signed user/bootstrap identity before opening a transaction.
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
