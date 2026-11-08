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

## File ownership and extraction

Choose placement by **responsibility, ownership and genuine reuse**, not by a
ban on top-level declarations or a target number of files. Prefer the narrowest
cohesive owner:

| Scope | Use it for | Examples |
| --- | --- | --- |
| Private to a file | Small implementation details that help explain their only consumer | `normalizedRule`, `sourceResponse`, repository table intersections, session-cookie constants |
| Feature-local file | A substantial policy/calculation with its own name and behavioral tests, even with one consumer | `summaries/spending-by-tag.ts`, `banking/ingestion/movement-assessment.ts` |
| Application-level area | The same semantics used across feature boundaries | API `validation/parse-input.ts`, `finance/movement-totals.ts`, RPC error/context helpers; persistence `serialization.ts` |
| Shared library/domain | A real cross-application contract or capability with compatible dependencies | Public tag-rule shape in contracts' `tags/`, private extension in `internal/tagging.ts` |
| Test support | Reusable fixtures, synchronization and test transport helpers | UI `testing/deferred.ts` separate from RPC fixtures |

Extract when a declaration represents a separate responsibility, obscures service
orchestration, needs focused behavioral coverage, or is genuinely shared. Keep
tiny selectors, closely coupled types, local constants and one-off helpers with
their owner when another file would only add indirection. Sharing a literal or a
similar-looking shape does not by itself establish shared semantics.

Application-wide does not mean a catch-all `utils`, `types` or `constants` file.
Keep infrastructure in its owning area: transport error policy belongs in `rpc`,
financial interpretation in `finance`, and input-to-HTTP-error conversion in API
validation—not in framework-neutral contracts. Do not create a Nest/Angular
service or module merely to house pure functions, or import another app's source
to reuse a helper. Preserve feature/provider lifetimes and dependency direction.

For example, income and tagging share input parsing while retaining their own
error messages. Authentication, startup configuration and provider ingestion
still own their different failure policies. Generic persistence serialization
maps nested `Date` values to strings in its return type; it must not pretend the
wire representation has the original `Date` type or convert decimal strings to
numbers.

Keep mixed-domain contract implementations out of barrel indexes: put them in
domain files and re-export the supported package surface from `index.ts`.
Common files should contain genuinely shared primitives, not orphaned domain
schemas. A small cohesive module need not be split just because it is named
`index.ts`. Derive public/private variants from their domain-owned schema when
their meaning really is shared, rather than maintaining duplicate definitions.

When moving code, update all consumers directly, carry relevant tests with it,
and remove the original definition instead of leaving compatibility re-exports.
Test the extracted decisions/transformations, not import locations or constructor
wiring. Preserve runtime behavior, wire contracts, authorization, money/calendar
semantics and cancellation; verify the applicable static/build/contract checks.

## Type safety and boundary types

All application and shared-library TypeScript configurations use `strict`;
application test configurations inherit it. Keep key/value and input/output
relationships intact instead of silencing errors with `any`, broad `object`
parameters or double assertions. Prefer inference, `satisfies` and generics that
actually connect inputs to results. Schema-independent database operations accept
`Kysely<DB>` without tying migrations to an evolving application table map. The
migration-only database alias remains permissive at Kysely's migration boundary.

`unknown` is appropriate for raw validation input, caught exceptions and opaque
metadata. Narrow or validate it before use; a caller-selected generic return type
does not validate JSON or prove the type of a thrown error. Serialization types
must preserve nullable fields, tuple positions/lengths and exact numeric strings,
while mapping timestamps to their wire representation.

Test doubles must retain the contracts they stand in for. UI RPC handlers and
recorded calls derive procedure names, inputs and outputs from `ApiRouter`;
deferred responses use those output types. Deliberately malformed payloads and
transport failures use an explicit raw `Response`, not a blanket untyped handler.
API method stubs preserve parameters and awaited results without manufacturing
tRPC's branded promise type. Check mocked behavior before any unavoidable cast at
the class-injection seam; do not add production adapters just for tests.

Owner SQL fixture shapes stay API-test-local and reuse shared facts where their
meaning matches. Table-keyed generics check columns and values, while results
retain raw pg snake-case keys, timestamp `Date` values and decimal strings. These
are fixture representations, not a second runtime persistence layer or permission
to import persistence source into the API. Static type checks do not validate
actual database contents, SQL constraints or financial behavior.

## Backend test layout

Both backend apps keep unit tests beside the implementation and integration
suites outside application source:

```text
apps/<app>/
  src/                         # implementation and colocated *.spec.ts unit tests
  tests/
    fixtures/                  # shared test data, app/DB setup and clients, when needed
    integration/               # *.integration.spec.ts, grouped by feature when useful
    setup.ts                   # app-wide test setup, when needed
```

HTTP/RPC/MCP tests that assemble an application belong in `tests/integration/`
even when persistence is mocked. Keep suite-specific helpers in the suite and
shared fixtures app-local; do not make one app depend on another app's tests.
Shared data fixtures can also serve colocated unit tests. Production code must
not import test support.

Vitest discovers both locations by default. Filter to `src` for unit tests only,
or `tests/integration` for integration suites only. App build configurations
exclude `tests/`, while typechecks include relocated suites and fixtures. API
test support is consolidated under `apps/api/tests/`, not a separate `test/` tree.

## Verification tiers

**"No external services required" does not mean "no listener is opened."** API
router/HTTP/MCP specs can use Supertest, which binds an ephemeral listener even
when the Nest app itself only calls `init()`. Select `src` unit tests when a
session must not start servers. `pnpm test` is not a serverless-only shortcut; it
runs workspace test scripts, including Angular's default test behavior.

| Tier | Dependencies / side effects | Evidence it provides |
| --- | --- | --- |
| Formatting, architecture, RPC drift, build/typecheck | No app services or database; generated/build output may be written | Source boundaries, generated agreement, compilation |
| Backend `src/**/*.spec.ts` unit tests | In-memory/mocked dependencies; no HTTP listener | Financial calculations, signatures/policies, rollback logic and orchestration |
| UI one-shot suite | Angular test compilation, injected `RPC_FETCH` and jsdom; no dev/API/DB server | Resource/session/SSR isolation and presentation behavior |
| API `tests/integration/` HTTP/router/MCP specs | No real persistence needed when overridden, but may open local HTTP listeners | Transport policy, serialization, public/runtime surface and MCP auth |
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
pnpm --filter api exec vitest run src
pnpm --filter persistence exec vitest run src
```

These backend commands run all colocated unit tests, **not integration suites**.
UI/build warnings and nonfatal lint diagnostics should be reported, not silently
treated as zero warnings. Passing unit tests does not validate images, a database
load profile or live Firebase.

Unit tests target decisions and transformations in services/helpers and actual
security policy. Thin RPC delegation, constructor injection and generated type
plumbing do not need their own unit tests. Integration tests cover real
authentication, related ownership, serialization and transaction rollback.

### Service-starting integration checks

Run these only when starting test listeners is acceptable and an isolated
PostgreSQL 18 database already exists. Use a fresh dedicated database ending in
`_test`; a name check is a guardrail, not proof the contents are disposable.
Never use the development/user database or put real credentials in a committed
command/log. The following URL is a placeholder:

```sh
TEST_POSTGRES_OWNER_URL=postgresql://owner:password@localhost:5432/lazyfinance_test pnpm --filter persistence exec vitest run tests/integration
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

The API suite bounds concurrent workers to four. Real-persistence workflows use a
15-second test deadline instead of the unit/transport default of five seconds;
these multi-request scenarios are not route-latency benchmarks. Use disposable
fixtures and assess the separate performance target with a measured load run.

For the live Firebase extension, set `TEST_FIREBASE_ID_TOKEN_A/B` for two distinct
verified-email test identities, optionally `TEST_FIREBASE_PROJECT_ID` and
`TEST_FIREBASE_EXPIRED_ID_TOKEN`. Without both active tokens the live case skips.
Use only disposable users/data, never paste tokens into docs or shared logs, and
observe the [identity verification boundaries](identity.md#verification-scope).

## Financial and security review checklist

- Follow the [persistence read pattern](persistence-reads.md): purpose-shaped
  projections, stored joins and factual aggregates in persistence; no discarded
  snapshots, repeated catalog joins or nested scans over downloaded movements.
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
