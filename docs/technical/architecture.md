# Architecture

Start here for the current system map. Detailed references:
[private RPC/RLS](persistence-security.md), [database model/ERD](database-model.md),
[contracts/code generation](rpc-contracts.md), [UI lifetimes](ui-data-lifecycle.md),
[provider-neutral identity](identity.md) and
[developer verification](development-workflow.md).

The [ER and 4+1 atlas](../diagrams/README.md) projects this implementation
into stored relationships, logical responsibilities, package dependencies,
request/process interactions, physical topology and scenarios. **Deployment is
pending**: the physical view describes the checked-in Compose reference, not an
installed production environment.

## Repository and runtime boundaries

`apps/ui` prerenders the public landing at build time and renders login/private
screens in the browser. Unprivileged Nginx serves only static UI assets. The
browser calls the explicit environment-configured API base URL using the NestJS public
tRPC API in `apps/api`; authenticated MCP tools enter that same workflow layer.
`apps/persistence` alone uses Kysely/pg to access PostgreSQL 18. Its `identity`,
`finance` and `assistant` schemas enforce user RLS with a restricted runtime login. All three apps
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
The generated inventories include bootstrap-only `identity.resolve`,
purpose-restricted OAuth state and separate banking claim/transport admission
procedures. The [RPC reference](rpc-contracts.md) owns current procedure counts.
`/mcp` exposes fourteen financial/supporting reads and two action tools (preview
and direct execution) through domain services, not direct persistence queries.
Ordinary HTTP covers API `GET /`, persistence `GET /health`, MCP transport and
OAuth discovery/protocol/browser-interaction routes, plus the authenticated NDJSON
assistant stream at `POST /assistant/turns`. Inventories and schema-change rules live in the
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
Optional write scopes default off at consent; existing read grants gain nothing.
Write tools additionally require the action's scopes and recheck the stored grant
inside execution. External clients control their own action-confirmation UX.
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
Authorization imports nothing. Explicit account discovery retains only bounded
selection metadata and discards balances; versioned selection/enrollment is
separate from financial account storage. New/unselected accounts never import.
Initial import and later manual refresh use the same selected-account path as
optional background execution, separate from readonly status and authorization.
Neither successful access nor a fetch forces the bank to update. Deselecting
preserves last-good facts, aliases and history; `account.active` is independent.
The local connection's immutable first-link date anchors forward movement tracking;
reported balances are not reconstructed from pre-link transactions. Dates are
Santiago accounting days, with the same-day precision limitation disclosed in the
UI. Historical-import options remain separate future work; existing records are
not purged when the sync scope changes.
Accounts and onboarding link to connection settings without requiring guide
completion. Provider normalization and financial calculations remain backend-owned;
the UI never reconstructs balances or marks failed imports as current data.
The [first-party financial assistant](financial-assistant.md) reuses those same
services through provider-neutral model adapters. Models can prepare bounded
proposals and read status, not approve/execute them. First-party action cards require
explicit ID/version approval; conversational agreement is not approval. MCP direct
execution uses separately granted write scopes, not that chat workflow. Existing
named domain commands and durable receipts commit together after fingerprint and
ownership checks. Server-owned history lives in `assistant.conversation`, with
independent `assistant.action` receipts that survive chat deletion. Model calls
never run inside SQL transactions.
`assistant.processing_consent` stores the account's current processing decision.
New/refused/outdated decisions show a dedicated entry screen; new non-demo text/
voice admissions require current saved acceptance. Consent changes no financial
permission and never starts capture or sends a question. History remains available
without new processing. See [consent policy and withdrawal limits](financial-assistant.md#account-processing-consent).
Generation is bounded, cancellable and lease/nonce protected. It defaults disabled;
live model quality remains a separate verification gate. One deferred UI host
preserves authenticated text state across navigation/minimization, inline in the
assistant-first home and docked beside financial pages. The complete dashboard
remains independent of AI. Optional WebRTC voice adds a server-side Realtime
control connection for native audio turns, financial tools and history leases;
captions never trigger the ordinary text stream. Text and voice both receive
fresh ledger-backed proposal outcomes, including edited approvals. Exact
financial approval remains independently server-validated. Client-controlled audio
rendering is not a grounding sandbox; memory-only voice admission/recovery requires
one API replica and separate provider spend controls. See the [live voice contract](assistant-live-voice.md).
External
client compatibility evidence is recorded in the [OAuth matrix](mcp-authorization.md#compatibility-and-verification-matrix), not inferred from documentation alone.

## Isolated banking synchronization and scheduling

`BankingSyncModule` composes provider discovery/import and the existing ingestion
module, without public controllers, auth, timers or listeners. `FintocModule`
owns credentials and one shared durable transport-admission boundary.
`BankingLinksModule` adapts verified manual commands; `BankingSchedulingModule`
separately provides the bounded runner and timer. Both invoke the same
`FintocImportService` → connector → `BankingIngestionService` → signed private
begin/facts/commit path, with the same financial preparation and tagging policy.
There is no background-specific ingestion algorithm or worker database pool.

The API hosts the timer; after building, `pnpm --filter api worker:banking` hosts
that module headlessly without `AppModule`, HTTP, Firebase, MCP or assistant.
`BANKING_AUTOMATIC_SYNC_ENABLED` defaults false; valid matching-mode provider
configuration and explicit account enrollment are also required. Success schedules
an available-data import one hour plus 0–5 minutes jitter later. The timer wakes
immediately and then 60 seconds after settlement. Durable claims allow multiple
replicas/hosts with one globally reserved background run; row-lock `SKIP LOCKED`
and due-time ordering avoid waiting on a user-held schedule row. Attempt-quota
deferral releases the claim and advances due time. Leases bound abandoned work.

The `banking-scheduler` signed purpose can only claim operational due records;
`banking-transport` only admits/releases requests and persists per-mode backoff.
Neither can read financial/credential/identity data or edit enrollment. The runner
uses the claimed server owner in ordinary signed user-scoped synchronization;
begin/commit/failure match live credential/selection versions, claim and run lease.
Global request admission, per-mode read quotas, rolling daily connection starts,
retry/backoff and automatic failure pauses are durable across restarts/replicas.
Provider work stays outside SQL transactions. See the [policy](../planning/stage-c/banking-sync-policy.md)
for exact limits and acceptance gates.

Portability is an implementation requirement, not a claim of independently safe
deployment: future extraction must move the cohesive engine/tests and replace
composition/transport, without importing another app's source or duplicating
normalization/financial logic. Review a separate signing authority, credential
distribution and private networking first; the present trusted API signer can
assert users. Enrollment, access, worker activity, last successful import and
source freshness remain distinct. Live entitlement/cost/billing, real bank
freshness and production operation are not verified by this architectural
description; executed local checks and browser limits live in the
[delivery record](../planning/stage-c/experience-delivery.md).

## Operations

Fresh migrations only: table/types/constraints/indexes/grants/RLS apply together.
There is no legacy migration adoption or automatic database reset. Owner credentials
belong only to CLI/init/seed jobs; the API uses private RPC without a database
connection, and persistence rejects owner/BYPASSRLS runtime roles. Demo seeding
is explicit.

Compose supports private persistence, separate runtime environments and an owner-only
init job. Its full stack separates data/service/edge networks; database/persistence
ports are not published in that reference. Deployment and final environment
verification remain pending; the configuration is not evidence of production TLS,
secret storage, backup recovery or load readiness. See the
[technical manual](technical-manual.md) and
[development workflow](development-workflow.md).
