# Architecture

Start here for the current system map. Detailed references:
[private RPC/RLS](persistence-security.md), [database model/ERD](database-model.md),
[contracts/code generation](rpc-contracts.md), [UI lifetimes](ui-data-lifecycle.md),
[provider-neutral identity](identity.md) and
[developer verification](development-workflow.md).

## Repository and runtime boundaries

`apps/ui` prerenders the public landing at build time and renders login/private
screens in the browser. Unprivileged Nginx serves only static UI assets. The
browser calls the explicit environment-configured API base URL using the NestJS public
tRPC API in `apps/api`; authenticated MCP tools enter that same workflow layer.
`apps/persistence` alone uses Kysely/pg to access PostgreSQL 18. Its `identity` and
`finance` schemas enforce user RLS with a restricted runtime login. All three apps
build independently using committed generated type libraries; no runtime client
imports another application's source.

```text
Browser ─tRPC (configured API origin)→ API workflows ─signed tRPC→ Persistence ─SQL→ DB
Authenticated MCP ────────────────┘                                      user RLS
```

`libs/contracts` owns public and separately exported internal schemas.
`libs/rpc-api` / `libs/rpc-persistence` expose generated router types through
type-only facades. `libs/rpc-auth` is Node-only signing/verification code. Browser
code cannot import private schemas, signing code, Nest or database implementations.

| Layer | Owns | Does not own |
| --- | --- | --- |
| Angular browser/public prerender | Presentation, browser identity and verified credentials, page resources and explicit commands | SQL, private service assertions, authoritative financial calculations |
| Public API / MCP adapters | Bearer verification, internal principal, financial/calendar rules, response composition and provider orchestration | Database pools/credentials, migrations or generic SQL |
| Private persistence | Authenticated scoped transactions, bounded facts/aggregates, ownership checks and named atomic commands | Provider network calls, UI summaries or user-selected execution scopes |
| PostgreSQL | Exact stored facts, constraints/keys, related-owner RLS and transaction atomicity | Firebase verification, product authorization for external MCP clients |

Public/private tRPC are separate surfaces, not two routes to the same router.
The public generated library contains 69 procedures; the private library contains
81, including bootstrap-only `identity.resolve` and purpose-restricted OAuth state. `/mcp` exposes eleven authenticated
read-only tools through the API's domain services, not direct persistence queries.
Ordinary HTTP covers API `GET /`, persistence `GET /health`, MCP transport and
OAuth discovery/protocol/browser-interaction routes. Inventories and schema-change rules live in the
[RPC reference](rpc-contracts.md).

## Authentication, sessions and ownership

Only `auth.config` and `auth.loginMock` are anonymous public procedures. The API
verifies Firebase/mock bearers and resolves the stable provider/issuer/subject to
an internal UUID. First Firebase provisioning requires verified email and never
links different subjects by email. Mock is existing-only and rejected in production.

External MCP has a separate [standards-first OAuth boundary](mcp-authorization.md):
`oidc-provider` handles discovery, CIMD/DCR, S256 PKCE and rotating credentials;
authenticated first-party consent binds each grant to that same internal UUID.
Every MCP request verifies audience, permission, expiry and persisted grant state.
Firebase/app bearers are not accepted on `/mcp`, nor are MCP tokens first-party
management credentials. Consent/settings pages do not connect banks or move money.
OAuth artifacts use a dedicated signed purpose without financial RLS access;
the API's encrypted adapter is distinct from banking and private-RPC keys.

The API signs a short-lived assertion with the user/request UUID, or a restricted
identity-bootstrap purpose. Persistence verifies it before starting a scoped SQL
transaction. Bootstrap can only call the narrow identity resolver function; its
NOLOGIN owner has no finance access. Normal user identity is set transaction-locally;
pool reuse cannot retain it. Related write policies independently reject foreign
owners even where a foreign key alone would permit the relationship.

Assertions authenticate context, not encrypted or one-time/body-bound requests.
The API is trusted to assert users, and the persistence service is trusted to own
SQL execution. RLS does not defend against compromise of those trusted processes
or privileged database operators. Use protected/TLS private transport; the
[security reference](persistence-security.md) describes these limits and roles.

Public prerendering/hydration never starts authentication or fetches protected data.
Private entry serves a neutral static frame, then starts shared browser restoration
asynchronously. Its matching Angular loader stays visible for at least one second
on every workspace entry, including already-verified returns. Authentication and
destination-code loading run concurrently. After `auth.principal` verification,
the actual page mounts invisibly/inertly and starts page-owned reads during the
animation. A route-scoped readiness contract includes conditional visible reads;
the same instance is revealed after both readiness and the minimum second, with
usable errors/reload recovery for failed or slow preparation. Internal navigation,
filters and token refresh do not replay the animation. There is no financial
preload cache or reveal-time refetch. See the [entry lifecycle](ui-data-lifecycle.md#public-prerendering-and-browser-owned-private-rendering).
Firebase owns browser identity persistence; accepted application access stays in
memory, without an SSR cookie or persisted principal. The legacy bearer cookie is
expired without being read. Development mock reloads use only a tab-session token
and verify it with the API again. `AuthCredentials` holds accepted identity independently of the RPC client and
session coordinator. Its immutable scopes cancel old-user work on token changes
and logout; late 401s cannot expire a newer session. Page-owned feature services
use Angular resources for reads and native Promise commands for writes. Widgets
render resource state, not an Observable compatibility facade or HTTP-shaped
errors. Protected resources have no transfer-cache IDs and components do not
write financial `TransferState`; private routes are never prerendered or hydrated.
Protected fetches are no-store. Static HTML is non-personalized and revalidated;
fingerprinted assets are immutable. Firebase Web identifiers are public;
Admin and service signing keys are server-only.

## Financial and atomicity boundaries

The API owns scheduling, money/calendar arithmetic, summaries/comparisons, budget
progress, tag normalization/matching/ranking and provider orchestration.
Persistence exposes bounded stored facts/aggregates and named authoritative
commands, not public screen computations or arbitrary SQL scripts.

The [persistence read pattern](persistence-reads.md) keeps stored relationships,
projections and factual sums in SQL instead of downloading rows for API-side
joins/aggregation. Calendar windows, recurrence, financial interpretation and
provider/rule decisions remain in the API.

Income receipts are confirmed only against locked eligible owned transactions and
sources. Tag decisions and audit events commit together. Provider fetching and
preparation are outside SQL; commit rechecks revision/fingerprint and atomically
persists accounts, movements, removals, conflicts, decisions/events and checkpoint.
All user writes share a short advisory transaction lock so rule additions/removals
also invalidate stale work. Failed resolvers/output validation roll back. Network
ambiguity never triggers an automatic mutation replay.

Explicit refund/reimbursement allocations link owned credits to original purchases
without changing either booking date, tag or bank balance. Gross spending, applied
recoveries and net purchase cost stay separate from credit-period recovered cash;
recovered cash is not earned income. Budgets use the purchase's tag and applicable
revision, including later corrections to purchases tracked before archival.
Incompatible corrected facts retain the allocation as `needs_review` without
reducing spending. See the [recovery rules](rpc-contracts.md#expense-recovery-semantics).

Savings eligibility is defined and unit-tested as selected, signed cash allocations:
credits add and debits withdraw on checking/savings accounts, without requiring
known internal status or complete history. Same-goal tagged transfer legs net to
zero; goal totals sharing tags overlap. This is not an account balance or new
wealth. Savings targets have owned create/edit/archive/detail/history
operations with optimistic versions and immutable configuration revisions; edits
restate the current allocation view and archival retains a counting cutoff.
Measured progress returns exact totals, pending counts and account history coverage;
cursor-paginated evidence shares its selection and counting cutoffs. See the
[savings policy](../../apps/api/README.md#savings-contribution-policy-laz-35).

Money remains exact decimal strings; calendar dates remain strings. Checking/savings
cash and credit-card liabilities retain their existing meanings. Confirmed internal
transfers/card payments do not count as spending/income. Unknown/review/removed
movements cannot be silently treated as confirmed external. A single optional tag
belongs to each transaction; expectations, receipts and balances remain distinct.

The authenticated UI has a responsive sidebar, overview, owned transaction
history/detail/corrections, tag lifecycle, income plans/receipts, revision-aware
budgets with contributing-purchase evidence, savings targets/measured allocations
and optional setup navigation. Financial resources remain page/component-owned.
Small account-level onboarding metadata is read by a credential-scoped UI service
and persisted in `identity.onboarding`, not browser storage or protected hydration
payloads. Completion is terminal; skipped guides are resumable without recurring
reminders. **Mi dinero → Cuentas** exposes stored balances/freshness; **Mi cuenta →
Conexiones bancarias** exposes the owned
[Fintoc connection lifecycle](../../apps/api/src/banking/linking/README.md): explicit
hosted authorization, access checks, same-identity relink and confirmed disconnect
with pending cleanup recovery. Its cancellable Widget flow waits for backend
confirmation and is separate from stored balances/freshness; access is not proof
of current financial data. The API's explicit [first snapshot import](../../apps/api/src/banking/fintoc/README.md)
and repeatable snapshot refresh map available Fintoc facts through shared atomic
ingestion. Durable leases/backoff, interrupted-run recovery and readonly source
freshness reporting are consumed by one selected web synchronization panel.
Initial import and later snapshot refresh are explicit commands, separate from
readonly status and authorization. Neither successful access nor a fetch forces
the bank to update.
The local connection's immutable first-link date anchors forward movement tracking;
reported balances are not reconstructed from pre-link transactions. Dates are
Santiago accounting days, with the same-day precision limitation disclosed in the
UI. Historical-import options remain separate future work; existing records are
not purged when the sync scope changes.
Accounts and onboarding link to connection settings without requiring guide
completion. Provider normalization and financial calculations remain backend-owned;
the UI never reconstructs balances or marks failed imports as current data.
The first-party conversational agent remains separate future work. External
client compatibility evidence is recorded in the [OAuth matrix](mcp-authorization.md#compatibility-and-verification-matrix), not inferred from documentation alone.

## Operations

Fresh migrations only: table/types/constraints/indexes/grants/RLS apply together.
There is no legacy migration adoption or automatic database reset. Owner credentials
belong only to CLI/init/seed jobs; the API uses private RPC without a database
connection, and persistence rejects owner/BYPASSRLS runtime roles. Demo seeding
is explicit.

Compose supports private persistence, separate runtime environments and an owner-only
init job. Its full stack separates data/service/edge networks; database/persistence
ports are not published. This is local deployment evidence, not production TLS,
secret storage, backup recovery or load profiling. See the
[technical manual](technical-manual.md) and
[development workflow](development-workflow.md).
