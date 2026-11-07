# Platform evolution alongside Stage B

This work was carried out **while Stage B was being built**. PRs
[#26](https://github.com/ig-peralta/LazyFinance/pull/26),
[#27](https://github.com/ig-peralta/LazyFinance/pull/27) and
[#28](https://github.com/ig-peralta/LazyFinance/pull/28) adjusted the engineering
direction from extending a demo-backed application toward a shared, user-scoped
financial foundation for several experiences and integrations.

The product goal did not change: help people understand their finances without
reconciling balances and movements by hand. What changed was how the system
supports that goal as the web application, identity, banking, MCP and first-party
agent tracks advance in parallel. This is a rationale for that adjustment, not a
Stage B closure record, a new stage or a claim that all its workstreams are done.

## Why the direction needed to evolve

Stage A established financial meaning using controlled data before depending on
Fintoc. That core-first decision remains in place. The adjustment here concerns
how to extend the validated foundation, rather than replacing it with a new
financial model or returning to provider-led development.

The [product vision](../../product/product-vision.md#architecture-for-growth)
calls for financial concepts that are independent of a particular provider,
interface, authentication mechanism or agent. The
[innovation argument](../../product/innovation.md#from-banking-displays-to-reusable-financial-understanding)
depends on reusing trustworthy financial understanding across sources and
destinations—not merely exposing another account list or making raw data
conversational.

That creates concrete responsibilities. A dashboard and an agent must not
calculate different spending totals. Adding a login method must not select a
different financial owner. A provider correction must not erase the user's
classification or confirmed income receipt. A late browser response must not
appear in another user's session. These problems become harder to reason about
when database access, transport, identity and presentation responsibilities are
mixed together.

The requirements do not prescribe Kysely, tRPC or a particular number of services.
Those are engineering choices. The necessary outcomes are reusable financial
meaning, explicit ownership, precise contracts and changes that can be verified
without relying on undocumented local state.

## Product intentions behind the changes

| Product need | Why it matters | Direction taken |
| --- | --- | --- |
| [Shared financial results](../../product/product-requirements.md#shared-financial-results-across-interfaces) and [NFR-03](../../product/non-functional-requirements.md#nfr-03--financial-integrity-and-explainability) | The same user and period must produce consistent balances, spending, budgets and income interpretations across interfaces | Keep financial interpretation in API services; expose shared contracts and owned stored facts instead of duplicating calculations in clients |
| [NFR-01](../../product/non-functional-requirements.md#nfr-01--user-isolation-and-access-control) and [NFR-02](../../product/non-functional-requirements.md#nfr-02--confidentiality-and-session-privacy) | Real-user access and more entry points must not weaken financial ownership or leak session data | Separate external identity from the internal user, authenticate both RPC boundaries, enforce related-owner RLS and isolate browser/SSR lifetimes |
| [Provider-neutral banking](../../product/product-requirements.md#provider-neutral-banking-data) and [NFR-04](../../product/non-functional-requirements.md#nfr-04--idempotent-recoverable-banking-synchronization) | Repeated imports, corrections and failures must preserve source facts, user decisions and the last confirmed checkpoint | Keep provider fetching outside SQL and make revalidated, multi-table persistence commands atomic |
| [NFR-05](../../product/non-functional-requirements.md#nfr-05--graceful-degradation-and-truthful-state) and the [first-party experience](../../product/product-requirements.md#first-party-experience-and-access) | Empty, stale, failed, cancelled and confirmed states mean different things to a person | Use explicit resource/command lifetimes, confirmed updates, recoverable authentication steps and sanitized errors; do not replay ambiguous writes |
| [NFR-06](../../product/non-functional-requirements.md#nfr-06--interactive-performance) | Common reads should not transfer histories or repeatedly scan catalogs merely to produce a small result | Return purpose-shaped joins and aggregates, and build reusable indexes once per immutable facts snapshot |
| [NFR-08](../../product/non-functional-requirements.md#nfr-08--reproducible-setup-and-maintainable-changes) | Parallel development must remain reproducible and reviewable across the workspace | Separate initialization credentials, generate checked contracts, enforce strict types, organize tests/helpers by responsibility and keep setup guidance aligned |

These changes support the requirements; their presence alone does not certify
every acceptance target. In particular, reducing redundant work is not a measured
latency or load result.

## How the three PRs fit together

### PR #26 — establish explicit runtime and ownership boundaries

The main change was moving database responsibility out of the public API and
behind a private persistence service:

```text
Dashboard / request-local SSR → public tRPC API → signed private tRPC → persistence → PostgreSQL
Authenticated read-only MCP ──→ the same API financial services
```

The API continues to own financial rules, calendar calculations, classification
and provider orchestration. Persistence owns SQL, factual reads and authoritative
cross-table commands. Kysely replaces the API's Drizzle implementation within
that new boundary; changing an ORM by itself is not the security or correctness
argument.

The supporting changes make the split enforceable and usable:

- **Scoped data access:** a short-lived signed service assertion carries either
  an internal user context or the narrowly permitted identity-bootstrap context.
  Persistence opens a transaction with local identity settings, checks related
  owners and rolls back failures before commit. Sixteen sensitive tables force
  RLS; the shared provider catalog is runtime-read-only.
- **Preserved atomic behavior:** income confirmation, tag decisions/events and
  prepared provider synchronization remain authoritative commands. Provider
  calls stay outside SQL; locked revalidation protects newer decisions and
  checkpoints from stale preparation. A network failure is not permission to
  replay a possibly committed write.
- **Explicit contracts:** public business REST routes give way to public tRPC;
  a separate private surface supplies persistence facts and commands. Generated
  router types allow independent builds without importing another app's runtime
  source. MCP continues to reuse the API's financial services.
- **Owned UI state:** native tRPC Promises and page-owned Angular resources replace
  the catch-all API/Observable facade. Accepted credentials own cancellation;
  SSR verifies a token per render, protected responses are not transferred as a
  shared hydration cache, and late failures cannot expire a newer session.
- **Reproducible operation and review:** Compose separates the database, private
  persistence and API; migrations/provisioning use owner-only jobs while runtime
  uses a restricted login. Demo seeding is explicit. Biome and consistent Nest
  injection/readability conventions reduce unrelated variation during review.

The result is a clearer place to enforce each rule, not a claim that splitting
processes eliminates all trust. The API still authenticates users and signs their
scope; persistence still owns trusted SQL execution. Protected transport,
privileged-operator controls and production operations remain necessary.

### PR #27 — make the boundaries useful, precise and maintainable

A service boundary can still be inefficient or confusing if it acts like a
remote table repository. The next changes shaped reads around what callers
actually need:

- Objectives include their stored tags; budget reads return factual sums/counts
  for API-supplied windows instead of downloading movements for API-side joins.
- Expected-income reads avoid unrelated receipt/aggregate data. Tagged aggregates
  serve totals and breakdowns together while narrower classification aggregates
  remain available to callers that do not need tags.
- Provider movement facts include their external account key and receipt-presence
  flag. Those facts participate in the fingerprint rechecked at commit, instead
  of requiring duplicate account joins and receipt scans in the API.
- Rule matching and income scheduling reuse indexes built for the facts snapshot,
  preserving ranking, eligibility, manual/no-tag decisions and calendar meaning.

This is not a transfer of all product calculations into SQL. Persistence returns
owned relationships and factual aggregates; the API still decides calendar
windows, financial interpretation and the public result. The
[read-pattern guide](../../technical/persistence-reads.md) explains that distinction.

The same refinement applies to code ownership and verification: redundant
per-domain transport wrappers were removed, helpers and schemas were placed with
their responsible domains, `_utils` became `utils`, and application typing became
strict. Wire serialization preserves nested timestamp, tuple and null semantics;
test doubles retain RPC/database input and output relationships. Backend
integration suites live separately from application source so serviceful checks
are not mistaken for isolated unit checks.

Private read contracts changed and their generated consumers must be rebuilt
together: the private surface grew from 35 to 37 procedures while the public
surface remained at 33. No database migration accompanied this refinement.

### PR #28 — expand access without changing who owns the data

Real-user access must be usable without treating an email address or a browser
claim as financial authority. Google and email/password are Firebase sign-in
methods under one Firebase UID, which continues to map to the same internal user.

Password registration, verification resend/recheck and reset emails were added.
Registration alone does not install an application principal or SSR cookie;
first onboarding still requires verified-email evidence and API verification.
The authenticated `/seguridad` page connects methods explicitly: confirm Google
before adding a password, or confirm the current password before opening a
separate Google-linking popup. Fresh token verification must retain the same UID
and internal owner.

Email equality does not merge identities or move financial records. Pending OAuth
credentials and passwords are not persisted for automatic recovery. Session
commands coordinate non-abortable SDK operations with observers, logout and
component cancellation so obsolete results cannot restore access to an old
identity. Cancellation still cannot undo a credential change Firebase has already
confirmed.

This extends access to the shared financial core; it does not create another
financial-owner model, change the database schema or add public RPC procedures.
It is also **not MFA**: either connected method can grant access independently,
and a password does not inherit Google MFA. Firebase project settings and email
recovery remain part of the access boundary. The JavaScript-readable token cookie
and local-only logout/revocation limitations remain explicit in the
[identity guide](../../technical/identity.md#firebase-sign-in-and-credential-linking).

## Relationship to the six Stage B workstreams

The [workstream map](README.md#workstreams-from-linear) preserves the scope
recorded in Linear. These relationships explain the supporting intent of the
PRs; they do not update issue statuses or certify the complete parent outcomes.

| Workstream | What the shared foundation supports | What still needs its own acceptance evidence |
| --- | --- | --- |
| LAZ-31 — financial backend | Owned commands, precise read contracts and consistent financial services | Each committed management/history flow and the unresolved refund, budget-history and savings policies |
| LAZ-30 — web application | Page resources, isolated sessions, explicit commands and real-user access | Persistent financial-management and onboarding workflows, not merely routes or placeholders |
| LAZ-29 — Firebase identity | Stable internal ownership, additional sign-in methods and same-account linking | Verification of the delivered flows and isolation at the actual release baseline |
| LAZ-27 — external MCP authorization | Reusable user-scoped financial capabilities behind authenticated boundaries | External discovery/grants, permissions, expiry/revocation and a reference-client flow; internal service assertions do not implement these |
| LAZ-28 — banking and Fintoc | Provider-neutral facts, revalidated atomic ingestion and preserved decisions | Real Fintoc mapping/linking, connection lifecycle and operational refresh behavior |
| LAZ-26 — first-party text assistant | One source of financial meaning and explicit contracts for read-only capabilities | Agent orchestration, conversation ownership, usable chat and grounded-answer evaluation |

## What remains unchanged and what the work costs

The [J1–J5 financial meanings](../../product/user-journeys.md) remain the basis of
the core: exact CLP values and Santiago periods, balances distinct from income,
internal movements excluded from spending/earnings, a single optional movement
tag, untagged spending included in totals, and savings targets without invented
contributions. More interfaces must preserve those meanings, not reinterpret
them to fit their transport or model.

Clearer boundaries also introduce responsibilities. Three application runtimes
need coordinated configuration, matching generated contracts and service keys.
The storage cutover requires a fresh database and 20 checked-in migrations; it
does not import old Drizzle history, reset existing data or silently seed a user.
Owner credentials must stay out of runtime and API environments. These costs are
documented in the [technical manual](../../technical/technical-manual.md), rather
than hidden as machine-specific setup.

The foundation does not deliver a live bank adapter, external-client authorization,
a conversational agent, measured savings progress or a complete management UI
merely because the corresponding storage and contracts exist. Nor does it
establish production TLS, managed key rotation, backups, operational monitoring
or maximum-size load readiness. New shared/family/organization ownership and
financial-action permissions remain separate product decisions.

## Evidence and continuing the stage

The linked PRs distinguish implementation from verification. PR #26 records
selected executed checks at its implementation baseline; PRs #27 and #28 record
static validation, including types, generated contracts and source boundaries.
Compiling regression specs is not executing them, and earlier test results do
not certify every subsequent change. Database isolation/rollback, live Firebase,
provider behavior, end-to-end experiences and performance targets need their own
applicable evidence under the [verification tiers](../../technical/development-workflow.md#verification-tiers).

The next delivery decisions remain governed by the
[Stage B Definition of Done](definition-of-done.md) and the
[product release criteria](../product-definition-of-done.md). Workstreams must
demonstrate their committed user outcomes or record an explicit deferral. Stage C
is selected from that review, not assumed complete or scheduled by this platform
work. The engineering adjustment exists to make those product outcomes safer to
build, more consistent to use and easier to verify.
