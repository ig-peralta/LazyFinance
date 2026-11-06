# Persistence, tRPC and user RLS

**Implementation record — 2026-11-06.** The three application boundaries are now
implemented. Final validation results belong in the service guides/check commands;
this document records decisions and invariants, not an old-data upgrade promise.

## Architecture and reference

```text
Angular browser / request-local SSR
  └─ vanilla @trpc/client + @lazyfinance/rpc-api types
      └─ NestJS public API: verified Firebase/mock principal, financial workflows
          └─ vanilla @trpc/client + @lazyfinance/rpc-persistence types
              + short-lived Ed25519 service assertion
              └─ private NestJS persistence: Kysely / pg / scoped transaction
                  └─ PostgreSQL 18: identity + finance, user-level RLS
MCP ── authenticated, read-only adapters ── public API workflow services
```

Follow `~/principia/baas` for schema-root modules, table-local `*.tables.ts`
interfaces/maps, repositories, the ALS-backed scoped database, one ordered
multi-folder migrator, explicit credential provisioning and ownership policies.
Use stock NestJS-tRPC decorators/HTTP plus vanilla clients instead of its custom
RPC dispatcher, NATS transport, context-routing wrappers or chunking protocol.

There is **one database and one persistence application**, fixed `identity` and
`finance` schemas, and one internal UUID per user. Tenants, organizations,
memberships, account sharing, role ACLs and general system/admin bypass are out
of scope. PostgreSQL schemas are domain boundaries, not a multi-tenancy design.

Pinned boundary packages: Kysely `0.29.8`, pg `8.23.1`, NestJS-tRPC `2.14.0`, tRPC
`11.24.0`. App builds consume committed generated sources, not another app's code.

## Contracts and generated libraries

| Package | Responsibility |
| --- | --- |
| `libs/contracts` | Public domain/input/output schemas, separate private/context exports. No Nest, database or transport implementations. |
| `libs/rpc-api` | Generated public router source and type-only facade. Public contracts only. |
| `libs/rpc-persistence` | Generated private router source and type-only facade. May reference private contracts. |
| `libs/rpc-auth` | Node-only Ed25519 JWT signing/verifying; never imported by UI. |

All procedures declare shared Zod input/output schemas and context metadata.
`pnpm rpc:generate` generates both libraries; `pnpm rpc:check` rejects drift and
application imports. Placeholder router implementations are never imported at
runtime. The runtime routers are ordinary Nest providers discovered by NestJS-tRPC.
Tests compare the generated and runtime procedure surfaces (33 public, 35 private).

Only `auth.config` and `auth.loginMock` may be public. Every other public procedure
requires a verified bearer. Missing/unknown metadata is denied, including on an
accidentally registered router. MCP and health are intentional ordinary HTTP
exceptions; the old business REST controllers have been removed.

## Fresh, small, atomic migrations

The user explicitly chose **fresh migrations only**. There is no frozen Drizzle
SQL/journal, legacy ledger adoption, migration bridge, old-data compatibility,
table/enum relocation or automatic reset. Existing databases must be left alone;
initialize a separate empty database. Drizzle/postgres-js dependencies and API
database code/history have been removed.

Twenty globally ordered migrations live under
`apps/persistence/src/database/migrations/{identity,finance}`. Each table migration
creates its related types, constraints, indexes, grants and RLS together. Kysely's
PostgreSQL migrator serializes the runner and applies transactional DDL/ledger
updates. Failed work rolls back without an applied ledger entry. Do not introduce
a huge all-schema migration or create an unprotected table in one migration and
add its protection in another. Destructive `down` paths for identity foundations
are refused; data recovery requires an explicit operator plan.

| Schema | Application tables |
| --- | --- |
| `identity` | `user`, `external_identity` |
| `finance` | `provider`, `provider_connection`, `account`, `transaction`, `tag`, `tag_rule`, `tag_decision_event`, `objective`, `objective_tag`, `income_source`, `income_expectation`, `income_receipt`, `provider_sync_state`, `provider_movement_removal`, `provider_movement_conflict` |

The Kysely ledger is owner-only infrastructure, not a business table or RPC.
Cross-schema FKs point to internal user UUIDs. The API cannot run migrations or
fall back to SQL. Seeds are explicit tooling, not migrations/startup effects.
The Kysely demo seed retains stable fixture IDs, multi-year Chilean CLP history,
income declarations/receipts, single tags, transfers and meaningful objectives.

## Credentials, identity bootstrap and RLS

- `POSTGRES_MIGRATION_URL` belongs only to migration/provision/seed jobs.
- `db:provision-runtime` creates a separate LOGIN inheriting the NOLOGIN
  `lazyfinance_runtime` permission role. Existing managed passwords are not
  silently rotated; unmanaged or privileged collisions are refused.
- Startup rejects owner, database-owner/member, superuser, BYPASSRLS,
  role-creation, schema-creation, bootstrap-owner or privileged-role credentials.
- The API receives only the signing private key and private RPC URL; persistence
  receives only the public key and restricted runtime URL. Runtime API startup
  rejects PostgreSQL credential variables.
- A 30-second EdDSA JWT verifies issuer/audience/key ID/lifetime/signature and a
  strict context schema. User context has internal user UUID + request UUID.
  Bootstrap context has only a verified external identity + request UUID.
- User metadata cannot call bootstrap, and bootstrap can call only
  `identity.resolve`. The API never trusts a caller-proposed internal UUID.

`identity.resolve_external_identity(...)` is a narrow `SECURITY DEFINER` function
owned by a dedicated restricted NOLOGIN role. Its fixed search path puts
`pg_catalog` first and `pg_temp` last; all objects are schema-qualified and PUBLIC
execution is revoked in the same migration. The owner can only SELECT/INSERT the
identity tables under explicit RLS policies and has no finance-schema access.
The runtime can EXECUTE that function, not assume its owner or query identity
mappings directly. Mock resolution is existing-only. Firebase provisioning uses
the stable provider/issuer/subject key, a transaction advisory lock, verified
email for first sign-in and collision rejection—never automatic email linking.

Enable **and force** RLS on all 16 sensitive tables. `finance.provider` is the
documented shared, runtime-read-only catalog exception.

| Ownership path | Tables/checks |
| --- | --- |
| Direct user | connection, account, tag, rule, objective, income source; normal identity.user self-read |
| Account parent | transaction; its optional tag/rule must belong to that user too |
| Connection parent | sync state and removal tombstones; a tombstone may precede an account/movement |
| Source parent | expectation |
| Movement and source | receipt |
| Objective and tag | objective_tag |
| Movement and referenced tags/rule plus user | append-only tag decision events |
| Movement parent | provider conflicts |

Foreign keys do not prove same-user ownership. Write policies independently check
every related owner, including upsert paths and owner reassignment. Sensitive
policies form acyclic indexed parent `EXISTS` paths. Runtime grants accompany
policies; RLS is not a grant. Bootstrap policies confer no financial bypass.

The GUC is trustworthy only because the authenticated persistence service owns
SQL execution; it is not cryptographically verified inside PostgreSQL. A fully
compromised persistence process is outside that protection. Never expose arbitrary
SQL, generic transaction scripts or a dispatcher accepting caller-proposed scopes.

## Scoped transactions and atomic commands

Repositories inject only `RLS_DB`. It resolves the transaction from ALS, throws
outside a scope and refuses nested/raw connection access. NestJS-tRPC inspects
provider constructors; the proxy deliberately permits only that harmless reflection.
Context verification opens no transaction. Middleware opens one transaction **per
procedure**, sets all identity fields with transaction-local `set_config(...,true)`,
and waits for the resolver **and output validation** before commit.

tRPC `next()` can resolve `{ ok: false,error }`; middleware throws it inside the
transaction callback. Merely returning that failure would commit partial writes.
Tests cover resolver failures and invalid output after a write. Pool reuse never
retains a user's settings after commit or rollback.

Normal operations use read-committed; factual snapshots request repeatable-read.
All user mutations share a short per-user advisory transaction lock. This covers
new/deleted rules and other phantom inputs, not only the rows previously read.
Provider network calls and product calculations are never inside that transaction.
An HTTP/RPC batch is not a distributed transaction: cross-table atomic changes
are explicit named commands.

| Capability | Persistence responsibility | API responsibility |
| --- | --- | --- |
| Identity | Atomic resolve/provision | Firebase/mock verification and provisioning mode |
| Financial reads | Bounded owned facts, persisted-dimension sums/counts | Eligibility, amounts, response composition and periods |
| Income | Source/expectation invariants; locked receipt eligibility/upsert/clear; consistent facts snapshot | Calendar schedules, expected income, summaries |
| Tagging | Rule/candidate facts; fingerprint checks; atomic manual/prepared decisions + audit events | Normalization, exact matching, priority/specificity/ambiguity, suggestions |
| Provider sync | Begin/facts; revision/fingerprint-checked commit; authoritative preservation/conflict/removal checks; failure recording | Fetch/pagination/validation, owned-pair classification, booking conversion, prepared writes |

Prepared fingerprints use schema-normalized, canonically sorted wire facts.
Commit recomputes them under the write lock. Manual choices cannot be overwritten
by a stale computation. Automatic decisions recheck ownership, approval,
direction/account scope, merchant-only automation, review and internal status.
Sync preserves aliases, overrides, confirmed receipts and manual tags; corrections
revalidate rule decisions only when relevant facts change. Tombstones win over
replays and can precede first import. Conflicts suspend interpretation without
discarding the bank fact/user decision. The checkpoint moves only with committed
facts/conflicts/events. Older revisions are superseded; failures retain the last
good checkpoint/balances/success time. Ambiguous network failures are not retried.

## Precision and resource budgets

pg `numeric`/int8 remain exact strings; money is not globally parsed as Number.
Calendar dates remain strings, timestamps are ISO strings over RPC, and the
runtime CamelCasePlugin preserves nested JSON keys. Runtime Kysely table maps
are schema-local; migrations do not import evolving table interfaces.

Public request bodies are limited to 1 MiB, batches to 10. Private batches are
disabled (one procedure), and only large private scope queries use POST override.
Provider runs accept at most 100 pages / 50,000 records **and** 32 MiB normalized
JSON / 64 MiB prepared JSON or factual results. This is a deliberate compound
resource bound: text-heavy pathological batches fail before financial writes,
not silently truncated or split. `scripts/measure-sync-payload.mjs` measured a
50,000-record ordinary fixture at 13.67 MiB normalized / 27.40 MiB prepared; a
maximal UTF-8-text fixture was 136.63 / 222.48 MiB and is intentionally rejected.
The count limit alone is not a safe transport/memory budget.

Client/server request deadlines are 120 seconds; PostgreSQL statement, lock,
idle-transaction and whole-transaction limits are 20s / 5s / 10s / 100s. Errors
walk nested wrappers for SQLSTATE or domain codes, expose only sanitized messages
and omit stacks. Only known rolled-back stale-input rejections are recomputed.

## Angular, SSR and deployment

The UI uses native tRPC Promises and feature-owned Angular resources rather than
preserving the old component/Observable facade. `RpcClient` reuses a client within
one immutable verified credential scope. `AuthCredentials` is independent of
networking and session coordination, avoiding circular injection. `AuthApi`
separates anonymous calls from candidate-token verification; verification does
not install or expire an accepted session. Token changes/logout abort the old
scope and invalidate resource values. Late results or 401s cannot affect a newer
identity. No module-global authenticated client, batch queue or cache exists.

`DashboardPage` owns feature data services; their resources stop when the page is
destroyed. Widgets render resource state rather than maintaining duplicate
loading/error flags or converting Promises to Observables and back. Tag commands
publish confirmed page-local decisions, refreshing only dependent summaries and
budgets. Confirmed decisions win over older in-flight reads; later reloads can
reconcile server changes. Partial rule-creation failures remain explicit, and
ambiguous mutation failures are never automatically replayed.

Each SSR render has isolated DI/auth state, uses `API_INTERNAL_URL`, and revalidates
its token-only cookie through the API. Browser Firebase refresh/revision checks
remain intact. Protected fetches and SSR HTML are private/no-store, and private
data is not transferred into a different browser identity's hydration. Protected
resources deliberately have no transfer-cache IDs, and manual financial
`TransferState` writes have been removed. Tests inject `RPC_FETCH`, since
HttpClient interceptors do not intercept vanilla tRPC.

Compose has an owner-only init job, explicit optional seed job and separate
persistence/API/UI environments. Persistence has no published port; the full
stack separates data, service and edge networks. Images build from pruned
workspaces without other app source or native generation. This is a local demo
setup, not production TLS, secret storage, backup/recovery or external MCP OAuth.
Use a protected/TLS service channel outside the local network.

## Verification and remaining operational work

```sh
pnpm rpc:check
pnpm check:architecture
pnpm build
pnpm typecheck
pnpm --filter api test
pnpm --filter ui exec ng test --watch=false
TEST_POSTGRES_OWNER_URL=... pnpm --filter persistence test
TEST_POSTGRES_OWNER_URL=... pnpm test:integration
```

Integration targets must be disposable databases ending in `_test`; they seed
unique fixtures rather than borrowing production credentials. Behavioral assertions
cross real signed RPC boundaries and restricted runtime roles. Coverage includes
all sensitive tables, forged links, pooled/concurrent users, bootstrap concurrency,
money/date/JSON fidelity, rollback, income/sync/tagging parity, public/MCP ownership,
generated/runtime surfaces and browser/session isolation. Live Firebase-token
verification is explicitly skipped without the required tokens.

### Persistence-cutover validation evidence — 2026-11-06, before the UI resource rewrite

- Workspace build passed for all seven packages. Workspace typechecks passed;
  Angular application/test compilation also passed through its build/test runner.
- API suite against compiled persistence: **174 passed, one live-Firebase test
  skipped**. Persistence PostgreSQL/signing/type/middleware suite: **35 passed**.
  Angular suite: **83 passed**. Codegen drift, architecture and diff checks passed.
- All three Docker images built from their pruned workspaces, without another
  application's source or code generation. Runtime images run as non-root; the
  API image contains neither the fixture tooling nor an installed database driver.
- Image smoke checks applied all 20 compiled migrations to a newly created test
  database, provisioned/verified runtime credentials and seeded twice. Counts and
  balances stayed identical: 1,050 movements, 16 tags, five objectives, 37 receipts
  and five explicit expectations. Unsafe API/database runtime credentials were
  rejected; real HTTP bodies above the public 1 MiB/private 64 MiB limits got 413.
- Image checks passed health, public/private RPC authentication, user isolation,
  financial reads, MCP initialization, authenticated SSR and forged-cookie denial.
  API smoke authentication used development-only mock mode, not live Firebase.
- Sync regression tests cover the real 100-page and combined 50,000-record bounds,
  UTF-8/cumulative byte accounting, prepared overflow and no ambiguous commit retry.
  Byte-boundary unit tests use reduced budgets. Payload sizing is not evidence of
  a successful 50,000-record database commit or representative RLS load profiling.
- Smoke containers, network, fresh test database and temporary credentials were
  removed. The original development database/container was not changed.

Those image/UI counts describe the cutover snapshot, not the later UI resource
rewrite.

### UI resource-rewrite validation evidence — 2026-11-06

- Angular suite: **85 passed across 20 files**, using real vanilla tRPC clients
  and Angular resources with injected in-memory `RPC_FETCH` responses. No
  development, API or database servers were started for this validation.
- Coverage includes concurrent authenticated SSR isolation, absent protected
  transfer-state payloads, identity/token changes, obsolete 401s, stale session
  restoration failures, Firebase observer failures, page/component cancellation,
  duplicate-write prevention, confirmed-decision/read races, and explicit partial
  success without automatic mutation retries.
- Workspace build: **seven packages passed**. Workspace typechecks passed;
  Angular application and test compilation passed through their build/test
  runners. Generated RPC drift, architecture boundaries, relevant UI formatting
  and `git diff --check` passed.
- The initial browser bundle is **616.32 kB**, above the existing 500 kB warning
  budget; this remains non-fatal.
- Docker image, live-service integration and live-Firebase checks were not rerun
  for this UI rewrite. The image evidence above predates these UI changes.

Production work still includes managed key rotation/secret delivery, backup and
restore rehearsal, authentication/rate-limit infrastructure, representative RLS
load profiling, and operational metrics/alerts. These are not claimed delivered
by a local refactor or a passing unit test.

Reference entry points: `~/principia/baas/apps/persistence/src/database/rls.ts`,
its schema-root/table modules and multi-migrator; NestJS-tRPC router/context/
middleware/CLI docs; tRPC vanilla clients and middleware-result semantics;
PostgreSQL RLS/SECURITY DEFINER guidance; Kysely migrations and driver-type docs.
