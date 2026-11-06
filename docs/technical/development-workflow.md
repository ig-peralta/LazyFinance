# Development, tooling and verification

Use this guide when changing the implementation; use the
[technical manual](technical-manual.md) for installation and operation. Commands
below run from the repository root unless stated otherwise. Service-starting
commands are explicitly separated from serverless checks.

## Workspace build and contract workflow

Node 22.22.3+ or 24.15.0+ and pnpm 9 are the documented development baseline.
Install the locked workspace with `pnpm install --frozen-lockfile`. The seven
packages are three apps plus contracts, the two generated RPC libraries and
Node-only RPC authentication.

`pnpm build` runs dependency-ordered workspace builds. `pnpm typecheck` checks
packages defining that script; Angular application/test compilation is performed
by its build/test runner, not a UI `typecheck` package script. To prepare shared
dependencies before running an app directly:

```sh
pnpm exec turbo build --filter=api^...
pnpm exec turbo build --filter=persistence^...
pnpm exec turbo build --filter=ui^...
```

The corresponding `--filter=api...` form also builds the app. Normal builds use
committed generated routers; run `pnpm rpc:generate` explicitly after router/schema
changes and review the diff. `pnpm rpc:check` generates temporary files and rejects
drift/import violations without starting an app. See the full
[RPC change recipe](rpc-contracts.md#changing-a-contract-or-procedure).

`pnpm check:architecture` checks API/database separation, qualified persistence
tables and raw-pool boundaries, browser/private imports, contract dependencies,
explicit RPC schemas/policies and obsolete UI data-access/transfer-state patterns.
It is a static pattern guard, not proof of all ownership or financial behavior.

## Biome, editor and readability conventions

Root [`biome.json`](../../biome.json) configures **Biome 2.3.11** as the only direct
formatter/linter. Prettier configuration/dependency and the unused ESLint
`globals` helper have been removed; do not introduce competing workspace formatters.

| Command | Effect |
| --- | --- |
| `pnpm lint` | Check formatting, lint rules and import organization |
| `pnpm lint:fix` | Apply safe fixes and organize imports |
| `pnpm format:check` | Check formatting without writing |
| `pnpm format` | Write supported-file formatting only |

The root [VS Code settings](../../.vscode/settings.json) and
[recommended extensions](../../.vscode/extensions.json) share these conventions.
The parser supports Nest parameter decorators, Angular interpolation
and Tailwind directives. Automatic `useImportType` enforcement is off because
Nest constructor metadata needs **runtime** class imports. Prefer ordinary
constructor injection for class tokens; reserve `@Inject()` for symbols such as
`RLS_DB`/`RUNTIME_DB` or deliberate token overrides. Provider registration/export
is still required; inference cannot repair a missing Nest module dependency.

Biome excludes generated RPC routers, `dist`, `node_modules`, `.turbo`, `.angular`,
coverage and `.local` secret/backup files. Generation, not formatting, owns the
router output. HTML formatting is disabled because this Biome version mishandles
Angular `@if`/`@for`; Angular compilation checks templates. Markdown/YAML remain
manually formatted. These commands are not a Markdown link checker.

Keep one blank line between constructors/methods, fields and methods, and
independent helpers/schema declarations. Group related simple fields; separate
validation, processing and result sections in longer functions. Keep decorators,
documentation and overload signatures attached to their declaration. Biome
preserves this spacing but does not insert/enforce logical section boundaries;
readability still needs review.

## Verification tiers

**"No external services required" does not mean "no listener is opened."** API
router/HTTP/MCP specs can use Supertest, which binds an ephemeral listener even
when the Nest app itself only calls `init()`. Choose explicit unit files when a
session must not start servers. `pnpm test` is not a serverless-only shortcut; it
runs workspace test scripts, including Angular's default test behavior.

| Tier | Dependencies / side effects | Evidence it provides |
| --- | --- | --- |
| Formatting, architecture, RPC drift, build/typecheck | No app services or database; generated/build output may be written | Source boundaries, generated agreement, compilation |
| Explicit backend unit/DI files below | In-memory/mocked dependencies; no HTTP listener | Signatures/policies, proxy rollback logic, injection wiring, orchestration |
| UI one-shot suite | Angular test compilation, injected `RPC_FETCH` and jsdom; no dev/API/DB server | Resource/session/SSR isolation and presentation behavior |
| API HTTP/router/MCP specs | No real persistence needed when overridden, but may open local HTTP listeners | Transport policy, serialization, public/runtime surface and MCP auth |
| Persistence PostgreSQL suite | Owner access to an existing disposable `_test` DB; creates/provisions fixtures and starts test HTTP listeners | Real RLS/grants, pooled users, identity races, migrations and rollback |
| Root API integration runner | Builds, migrates/provisions disposable DB, starts compiled persistence plus API test listeners | API workflows through real public/private RPC and restricted SQL roles |
| Live Firebase extension | Same isolated integration setup plus current test-user ID tokens and Firebase verification network access | Real token verification and two-user mapping/isolation |
| Docker/image or browser smoke | Builds/starts containers or app servers; may require manual browser sign-in | Runtime packaging, network/environment and deployment behavior |

A useful **serverless** set (after building shared libraries) is:

```sh
pnpm format:check
pnpm lint
pnpm rpc:check
pnpm check:architecture
pnpm build
pnpm typecheck
pnpm --filter ui exec ng test --watch=false
pnpm --filter api exec vitest run src/rpc/injection.spec.ts src/auth/firebase/firebase-auth.service.spec.ts src/persistence/persistence.client.spec.ts src/banking/ingestion/banking-ingestion.service.spec.ts
pnpm --filter persistence exec vitest run src/database/rpc-injection.spec.ts src/rpc/context-auth.spec.ts src/rpc/persistence.context.spec.ts src/rpc/rls.middleware.spec.ts src/rpc/rpc-types.spec.ts src/database/seed/ledger.spec.ts
```

These selected backend tests are **not the full backend suite**. UI/build warnings
and nonfatal lint diagnostics should be reported, not silently treated as zero
warnings. Passing the selected tests does not validate images, a database load
profile or live Firebase.

### Service-starting integration checks

Run these only when starting test listeners is acceptable and an isolated
PostgreSQL 18 database already exists. Use a fresh dedicated database ending in
`_test`; a name check is a guardrail, not proof the contents are disposable.
Never use the development/user database or put real credentials in a committed
command/log. The following URL is a placeholder:

```sh
TEST_POSTGRES_OWNER_URL=postgresql://owner:password@localhost:5432/lazyfinance_test pnpm --filter persistence test
TEST_POSTGRES_OWNER_URL=postgresql://owner:password@localhost:5432/lazyfinance_test pnpm test:integration
```

The persistence suite provisions its restricted runtime credentials and opens its
test app. The root runner builds API/persistence dependencies, applies migrations,
provisions a runtime login, generates ephemeral signing keys and starts compiled
persistence on an ephemeral loopback port. It supplies the private URL/key to the
API suite and stops that child service on completion. It does **not** start
PostgreSQL for you, run the persistence test suite in place of the API suite, or
drop/reset the target database afterward. Test roles are cluster-scoped; retain
only disposable fixtures and explicitly manage test-database cleanup.

Persistence DB tests skip without `TEST_POSTGRES_OWNER_URL`. API DB/workflow tests
require both owner fixture configuration and `TEST_PERSISTENCE_RPC_URL`, with the
matching test signing key; the root runner wires these together. Running API
tests with no integration environment is not evidence those skipped cases passed.
Other API transport specs can still open listeners even when DB cases skip.

For the live Firebase extension, set `TEST_FIREBASE_ID_TOKEN_A/B` for two distinct
verified-email test identities, optionally `TEST_FIREBASE_PROJECT_ID` and
`TEST_FIREBASE_EXPIRED_ID_TOKEN`. Without both active tokens the live case skips.
Use only disposable users/data, never paste tokens into docs or shared logs, and
observe the [identity verification boundaries](identity.md#verification-scope).

## Financial and security review checklist

- Preserve exact money/date/null semantics; do not infer income from any credit,
  tag, balance delta or provider salary hint.
- Preserve ownership at public authentication, signed private context and related
  RLS writes. Test foreign related IDs and upsert paths, not just list filtering.
- A new table's grants/RLS belong in its transactional migration. Use only the
  restricted runtime login in services; keep owner fixture SQL out of app builds.
- Provider requests/calculations stay outside SQL. Prepared commands must recheck
  fingerprints/revisions and preserve manual decisions, receipts and tombstones.
- Await resolver/output validation before transaction commit. Do not retry a
  mutation merely because the client timed out, disconnected or cancelled.
- UI reads/commands must retain accepted-scope cancellation, stale-result guards
  and no protected transfer-state payloads; test races, not only success order.
- Update current guides and generated inventories together. Keep dated evidence
  and conceptual diagrams labelled instead of rewriting them as current claims.

Passing local checks does not establish production hardening, live-provider
verification, current-image readiness or a successful maximum-size 50,000-record
database commit/load benchmark. Validate and record each claim separately for
the exact release baseline.
