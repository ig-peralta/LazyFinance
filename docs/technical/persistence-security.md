# Private RPC, scoped transactions and user RLS

This is the current security and atomicity reference. See the
[architecture](architecture.md), [database model](database-model.md),
[RPC contracts](rpc-contracts.md) and [setup manual](technical-manual.md) for
the surrounding system. This reference describes implemented boundaries and
limitations, not proof of production hardening.

## Trust boundaries

```text
Client bearer → API verifier → internal application user UUID
                    │
                    └─ signed service context → persistence policy
                                                  └─ scoped SQL transaction
                                                       └─ PostgreSQL user RLS
```

The API is trusted to authenticate users and assert their identities. Persistence
does not receive the browser's Firebase token and does not verify Firebase itself.
Only persistence executes application SQL. There is one database, fixed
`identity`, `finance` and `assistant` schemas, and user-level ownership: no tenant selection,
organizations, shared accounts or general administrator context.

The public tRPC middleware permits anonymous access only to `auth.config` and
`auth.loginMock`. All other procedures require `meta: { auth: "user" }` and a
verified principal. Missing metadata or another anonymously annotated procedure
is denied globally, even if its router was accidentally registered. Ordinary
HTTP health checks and authenticated MCP have their own transport handling.

## Signed service contexts

[`libs/rpc-auth`](../../libs/rpc-auth/src/index.ts) signs Ed25519 JWT assertions
using the API-only PKCS8 private key. Persistence receives the SPKI public key,
not the signing key. Generate a pair with `pnpm rpc:keys`; do not commit its output.

| Property | Enforced value |
| --- | --- |
| Algorithm / header type | `EdDSA` / `JWT` |
| Issuer / audience | `lazyfinance-api` / `lazyfinance-persistence` |
| Key ID | Matching `PERSISTENCE_RPC_KEY_ID`, default `primary` |
| Lifetime | Issued-at and expiry required; maximum age and lifetime 30 seconds |
| Context | Strict discriminated union from `@lazyfinance/contracts/context` |

The three allowed context shapes are:

```ts
{ kind: "user", userId: "<internal UUID>", requestId: "<UUID>" }
{ kind: "identity-bootstrap", identity: verifiedIdentity, requestId: "<UUID>" }
{ kind: "mcp-authorization", requestId: "<UUID>" }
```

The API creates these from verified server-side state, never a client-proposed
`userId` or a JSON identity supplied as authentication. Its private client captures
an immutable context and signs a fresh assertion for each call. Public tRPC
request IDs propagate through API async-local request context; other entry points
receive a generated UUID when necessary. These IDs are correlation values, not
idempotency keys or evidence of a complete tracing system.

Persistence verifies the bearer, signature, headers, issuer, audience, lifetime
and strict context before opening a SQL transaction. Global `RlsMiddleware`
then requires matching procedure metadata:

- `context: "user"` accepts only user context.
- `context: "identity-bootstrap"` accepts only bootstrap context and only on
  `identity.resolve`.
- `context: "mcp-authorization"` accepts only that purpose and the six named
  `mcpArtifacts` procedures. It cannot assert a user, bootstrap identity or read
  financial/profile tables. Ordinary user contexts cannot call it.
- Missing, unknown or mismatched policy is forbidden.

**Limits of the assertion:** it authenticates context, not an encrypted request.
It has no one-time nonce/replay store and is not bound to the procedure or body.
An intercepted valid assertion can be replayed during its validity window within
its context permissions. The trusted API can assert any user. Use a protected/TLS
service channel outside local development; never expose private RPC to browsers.
The configured single key/key ID is not managed multi-key rotation. Admission
within 30 seconds does not limit a transaction to 30 seconds.

## Identity bootstrap without a finance bypass

The stable `(provider, issuer, providerSubject)` identifies an external account;
the resolved `identity.user.id` owns financial records. The API verifies Firebase
or mock credentials before calling `identity.resolve` with `existing` or
`provision` mode.

The resolver invokes the narrow
[`identity.resolve_external_identity`](../../apps/persistence/src/database/migrations/identity/202611060004-identity-bootstrap.ts)
`SECURITY DEFINER` function. It:

1. Requires transaction-local bootstrap context and locks the external identity
   key to serialize concurrent first sign-ins.
2. Returns an existing mapping without remapping by email or name.
3. Refuses missing mock mappings and existing-only requests.
4. Requires verified email for first provisioning, inserting the user and mapping
   atomically. Unique-email collisions fail rather than linking another subject.

The function has a fixed `pg_catalog, pg_temp` search path and schema-qualified
objects. PUBLIC execution is revoked in the same migration. Its dedicated
`lazyfinance_identity_bootstrap` NOLOGIN owner has only the identity-table
SELECT/INSERT permissions/policies it needs, no finance access. The runtime may
execute the function but cannot assume that owner or directly query the external
identity mappings. See [provider-neutral identity](identity.md) for token and
revocation limitations.

## Owner and runtime credentials

| Credential / role | Purpose |
| --- | --- |
| `POSTGRES_MIGRATION_URL` | Owner-only migration, provision and explicit seed CLI jobs |
| `lazyfinance_runtime` | NOLOGIN permission role holding application grants/RLS policies |
| Provisioned runtime LOGIN | Inherits that permission role; supplied via `POSTGRES_RUNTIME_URL` |
| `lazyfinance_identity_bootstrap` | Restricted NOLOGIN function owner, not a runtime login |

Provisioning validates a distinct login name and a password of at least 16
characters. An existing safe managed login is accepted **without changing its
password**; unmanaged/unsafe collisions are refused. Runtime startup rejects
superuser, BYPASSRLS, role/database-creation or replication privileges, membership
in powerful/bootstrap/database-owner/table-owner roles, and CREATE access to the
application schemas. Persistence also rejects `POSTGRES_MIGRATION_URL` in its
runtime environment. The API uses the private RPC URL and signing key, with no
database driver or connection.

Do not inject the root Compose environment wholesale into app processes. These
checks are guardrails, not a substitute for keeping credentials separate.

## One transaction per private procedure

[`withRequestContext`](../../apps/persistence/src/database/rls.ts) opens the
transaction and uses `set_config(..., true)` for `lazyfinance.context_kind`,
`lazyfinance.user_id`, `lazyfinance.request_id` and transaction budgets. Settings
are local to that transaction and do not survive commit/rollback or pool reuse.
The connection pool is bounded to 10 connections with a five-second connection
timeout; this is not an end-to-end admission/rate-limit policy.

Repositories inject **`RLS_DB`**, an async-local proxy to that transaction. Access
outside a scope throws; nested scopes and repository use of `transaction`,
`connection` or `destroy` are refused. Only database infrastructure and transaction
middleware receive `RUNTIME_DB`. The proxy permits harmless constructor reflection
for NestJS-tRPC provider discovery, not raw connection access.

Normal procedures use read-committed. `income.expectedFacts`, `income.facts`,
`tagRules.facts`, `tagRules.candidates`, `providerSync.facts`, `providerSync.status`, `objectives.budget`,
`objectives.budgetHistory`, `financialActions.preview` and `transactions.expenseAdjustments` request
repeatable-read snapshots.
All user mutations acquire the same per-user advisory transaction lock. This
serializes writes affecting prepared inputs, including rule insertion/removal
that a row-only lock might miss. It is not a lock around provider network calls
or a transaction spanning several RPCs.

The middleware awaits the resolver **and output validation** before commit.
tRPC may resolve an error as `{ ok: false, error }`; middleware throws that error
inside the SQL callback so it rolls back. Returning that result normally would
incorrectly commit. Result-size failures also throw before commit.

## RLS and related ownership

All 27 sensitive application tables enable **and force** RLS. The twenty-eighth,
`finance.provider`, is a shared runtime-read-only catalog. Runtime grants and RLS
are both required: a policy alone is not permission to access a table.

`identity.current_user_id()` returns a UUID only for user context. Finance policies
use direct owners or indexed parent ownership paths. Writes independently check
related owners: an owned transaction cannot reference another user's tag/rule,
a receipt needs both an owned movement and source, an expense adjustment requires
both an owned credit and original purchase, and an objective-tag link
needs both owned ends. FKs alone cannot establish this. Tag decision events allow
runtime SELECT/INSERT but not UPDATE/DELETE. Budget revisions check a spending
parent owner and permit runtime updates only to supersession metadata; their tag
links are append-only and check both owners. Savings revisions and their tag links
are append-only and require an owned saving objective and owned tags. Identity mappings remain
bootstrap-only rather than becoming a user-readable identity directory.

`identity.onboarding` permits self-read/insert and column-limited updates to its
status/completion time. Runtime cannot delete or reassign those records, and
neither bootstrap nor unscoped requests can access them. This grants no profile
or external-identity write permission. Its named upsert makes completion terminal
and retains the first server timestamp; no financial facts are changed.

`assistant.conversation` is a separate owner-RLS schema, with no runtime CREATE
or owner/ID/retention reassignment. Its named commands enforce creation/turn quotas,
nonce replay and lease-checked completion under the user advisory lock. Model
calls remain outside SQL; conversation deletion changes no financial facts. See
[assistant persistence, cancellation and retention limits](financial-assistant.md).

`assistant.action` forces owner RLS and checks the optional conversation's owner.
Runtime cannot update ownership/origin/request/grant/client metadata or delete
records; a trigger forbids rewriting finalized applied/cancelled records. Chat
deletion only nulls its FK. Preparation/revision is not a financial write. Approval
requires a completed originating turn, exact current version, unexpired proposal,
current schedule policy and matching factual fingerprints under the user write
lock. Named domain commands and the durable receipt commit atomically. Stale
proposals change no finance; ambiguous responses are reconciled by read, not replay.
Normalized command targets, values and dependent tags must match the previewed
request, so an undeclared command cannot bypass its scope checks.
MCP direct execution separately rechecks granted write scopes under a stored-grant
`FOR SHARE` lock, binding idempotency to owner, origin, request UUID, payload and
client grant. Existing-record changes require a current preview fingerprint, not
a model-supplied approval flag. No model/provider call occurs in this transaction.
Identical committed requests return receipts even after their original schedule
can no longer be created; invalid fresh commands still fail without a write.

`identity.mcp_artifact` permits dedicated-purpose OAuth state writes only, with
an explicit model allowlist, hashed IDs, API-encrypted payloads and expiry/atomic
consumption. User scopes see only their matching provider grant or bound artifacts
and can delete only artifacts belonging to their grants during revocation.
`identity.mcp_grant` permits owned creation/listing and column-limited revocation;
binding rechecks the provider artifact's owner/client, and a trigger retains the
first revocation timestamp. The OAuth purpose can resolve/revoke grants but cannot
insert an owner-bound grant. These tables confer no banking privileges.

Consent decisions, code/refresh consumption and JWT replay detection are atomic.
Per-grant advisory locks coordinate token writes and revocation; writes cannot
resurrect a revoked/expired bound family. A failed replay returns `consumed: false`
**after committing** family revocation rather than throwing and rolling it back.
The provider adapter then returns the OAuth error. A global short quota lock
bounds artifact storage, with bounded expiry cleanup; per-owner user locks protect
the 50-live-grant limit. See [OAuth protocol and operational limits](mcp-authorization.md).

`finance.provider_link_intent` checks both optional connection FKs against its
owner in addition to direct owner RLS, and runtime DELETE is revoked. Lifecycle
commands claim callbacks atomically and recheck credential versions; provider
network calls remain outside SQL. `provider_connection` stores only API-encrypted
link credentials, never its encryption key or raw provider API keys. Global
provider/mode/external-ID uniqueness cannot reassign another owner's hidden row.
Disconnect/relink/status changes invalidate obsolete sync revisions and retain
financial history; pending remote deletion is explicit. See the
[lifecycle limits](../../apps/api/src/banking/linking/README.md#races-failures-and-limits).

The local GUC is trusted because authenticated persistence owns SQL execution,
not because PostgreSQL cryptographically verifies it. A compromised persistence
process or signing API is outside this isolation guarantee; privileged database
operators can bypass it. Do not expose arbitrary SQL, client-selected contexts,
or generic transaction scripts.

## Atomic commands and failure semantics

| Command | Authoritative persistence work | API work outside SQL |
| --- | --- | --- |
| Onboarding finish | Upsert only the scoped user's skip/completion; retain terminal completion and its first timestamp under concurrent writes | Authenticated optional-guide intent; no financial prerequisites or writes |
| External-client grant | Validate provider-artifact ownership, bind immutable consent; atomically consume credentials and revoke/delete a family | Verify first-party consent, run the OAuth protocol, encrypt/decrypt artifacts and enforce resource/scope/owner on MCP |
| Financial action | Recheck saved approval/version/fingerprint or MCP grant; execute bounded named commands and record one durable receipt, including dependent tags and decision events | Normalize exact money/schedules, prepare proposals, authenticate explicit UI approval or separately scoped MCP execution; no model execution authority |
| Income confirmation | Lock/check source and eligible movement; reject any retained expense allocation; upsert one receipt | Calendar/money calculations and response composition |
| Expense adjustment set/remove | Lock both owned movements; check eligibility, income exclusivity and credit/purchase capacity including retained review allocations; atomically upsert/remove one pair | Validate exact positive money and explicit refund/reimbursement intent; interpret gross/net aggregates |
| Tag decision | Decision and append-only event together | Normalize/rank rules and calculate suggestions |
| Budget create/edit/archive | Check owned active tags and expected version; save revision/tag links, supersede pending versions or record one archival cutoff atomically | Supported periods, Santiago boundaries, next-period edits and exact remaining/progress arithmetic |
| Savings target create/edit/archive | Check related tags and expected version; retain immutable revisions and current selection; record archival cutoff | Supported goal dates and current-definition allocation meaning; never synthesize contributions |
| Internal-movement correction | Lock owned nonremoved movement; save override/effective state and related conflict acknowledgements atomically | Exclude internal movements from spending/income; retain receipts/recoveries for eligibility re-evaluation, independently of tag names |
| Prepared rule application | Re-read candidate fingerprint, check eligibility, persist decisions/events | Match the bounded candidate page |
| Provider sync begin | Check owned provider/status/credential version; acquire a five-minute revision-bound lease or honor existing lease/backoff without changing attempt metadata | Resolve/decrypt owned credentials; perform no provider calls without an acquired lease |
| Provider sync commit | Check live lease/revision/fingerprint; persist facts, suspensions, tombstones, conflicts, decisions/events and checkpoint together | Fetch/validate all pages and prepare classifications |

Prepared fingerprints are based on normalized, canonically sorted wire facts and
are recomputed under the user write lock. They prevent stale calculations from
overwriting newer decisions; they are not client authentication. Failed sync
attempt metadata can be recorded separately without changing last-good balances,
success time or checkpoint. A committed run with durable unresolved conflicts
reports `needs_review`, not clean success. Older revisions are `superseded`.

Completion/failure ends the lease and advances its revision. Expired/revoked sync
failures also advance the credential version, preventing an earlier access check
from reactivating the connection. A crashed/unconfirmed attempt becomes interrupted
after lease expiry; a new claim supersedes late old results. Provider retry timing
is enforced on begin, not an automatic retry scheduler. Source freshness advances
only with the successful financial commit, never with begin, status or failure.

Only known rolled-back stale-input conflicts are recomputed, up to two retries in
the API's prepared workflows. Network/timeout ambiguity is **not** permission to
replay a mutation: the commit may already have succeeded. An HTTP batch is not an
atomic cross-procedure unit, and client cancellation does not prove server rollback.

## Resource and error boundaries

| Boundary | Budget |
| --- | --- |
| Public JSON body / batch | 1 MiB / at most 10 procedures |
| OAuth JSON/form bodies | 56 KiB; duplicated resource values are rejected, not collapsed |
| Private JSON body / per-procedure serialized result | 64 MiB / 64 MiB |
| Private batch | At most one procedure; clients use non-batched `httpLink` |
| Provider run | 100 pages; 50,000 combined account/movement/removal/suspension records; 32 MiB normalized JSON; Fintoc fetch budget 60s |
| API-to-persistence client / HTTP request timeout | 120s / 120s |
| HTTP headers timeout | 15s |
| SQL statement / lock / idle transaction / whole transaction | 20s / 5s / 10s / 100s |

These are compound limits, not a promise that every 50,000-record input fits or
commits within the budgets. UTF-8 text counts toward byte limits. Oversized runs
fail instead of silently truncating or splitting financial commits. PostgreSQL
18 is required for the configured whole-transaction timeout.

Persistence walks nested errors for SQLSTATE and emits sanitized conflict,
authorization, input or timeout errors; unknown failures become a generic
internal error. The API maps upstream errors to public domain/unavailability
errors. Both tRPC boundaries omit stack traces and send private/no-store headers.
Do not diagnose failures by exposing SQL, tokens or keys to clients.

Serverless policy tests and real-PostgreSQL rollback/isolation tests verify
different properties. See [verification tiers](development-workflow.md#verification-tiers)
before choosing a command; production TLS, rotation, backups, rate limiting,
representative load tests and operational alerts remain separate work.
