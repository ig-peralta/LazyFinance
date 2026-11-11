# Selected-account synchronization policy (LAZ-89)

- **Decision date:** 2026-11-10.
- **Status:** implementation design for review, not delivered automation.
- **Source:** LAZ-89 acceptance, repository baseline `7c017f7a`, public Fintoc
  documentation reviewed on the decision date, and the approved proposal.
- **Additional requirement:** synchronization must have explicit, isolated
  boundaries so it can later move to a separate service without rewriting its
  behavior or duplicating financial logic.

The current implementation remains the explicit snapshot workflow described in
the [banking guide](../../../apps/api/src/banking/README.md). LAZ-86 implements
selection; LAZ-90 implements background execution. This record changes neither
runtime behavior nor existing data. No organization plan, pricing, live bank or
deployment was inspected to make this decision.

## 1. Provider capability and selected mechanism

**Automatically import data already available at Fintoc. Do not schedule
bank-forced refreshes.** Manual recovery and background execution must use the
same selected-account snapshot workflow.

| Public provider evidence | Consequence for LazyFinance |
| --- | --- |
| [Movements overview](https://docs.fintoc.com/guides/movements/overview-data-aggregation/index.md): update intervals depend on the plan; live updates stop after the two-week trial without a subscription, even when Links appear active | Access and a successful API read do not prove that bank data is updating. The actual plan and cadence need operator confirmation before live enablement |
| [Link object](https://docs.fintoc.com/api/movements-api/links/link-object.md): active Links receive automatic provider updates; deactivation stops those updates and billing | Local selection controls LazyFinance ingestion, not upstream collection or Link billing. Selecting nothing does not deactivate or delete the Fintoc Link |
| [Account object](https://docs.fintoc.com/api/movements-api/accounts/accounts-object.md): `refreshed_at`, `next_refresh` and refresh status describe provider activity | Preserve source time independently from import time. A provider's next update is not a guaranteed completion time or LazyFinance's next import |
| [On-demand refresh guide](https://docs.fintoc.com/guides/movements/refresh-intents-walkthrough/index.md): extra-cost organization entitlement, asynchronous results, possible MFA and waiting periods; fixed-interval refreshes for every Link are discouraged | Do not create Refresh Intents, buy an entitlement, open MFA flows or promise forced bank updates as part of this mechanism |
| [API rate limits](https://docs.fintoc.com/guides/home/api-rate-limits.md): the documented organization maximum is 100 requests/second and can change | Use a much smaller application budget and honor provider backoff; the published maximum is not an allocated quota or cost guarantee |

Periodic snapshot reads are the chosen trigger. No provider webhook is selected
for this slice. A later event adapter must authenticate signatures, validate
mode and owned Link binding, deduplicate events and request the same workflow;
an event body must never become an authoritative financial write.

**Live enablement remains conditional:** confirm the organization's Movements
entitlement, actual update interval, institution limitations, Link billing and
acceptable volume/cost. An expired trial or missing entitlement cannot be fixed
by polling faster. Sandbox evidence does not establish these live capabilities.

## 2. Selection, enrollment and retained facts

Authorization, discovery and enrollment are separate operations:

1. Complete owned authorization without selecting or importing accounts.
2. Explicitly discover a bounded account inventory. Retain only the identifiers
   and minimal product/currency/masked-label metadata needed to choose accounts.
   Provider responses may include balances; discard those for unselected
   accounts and never fetch their movements. Do not log raw inventory payloads.
3. Confirm the selected set and permission for first import and future automatic
   imports together. Persist consent and a monotonically increasing selection
   version before starting the confirmed work. If operational automation is
   disabled, disclose that fact rather than showing updates as enabled.

The durable discovery/selection records are separate from imported
`finance.account` financial facts. Keys are `(connectionId, externalAccountId)`;
aliases, numbers, provider ordering and existing imported rows cannot establish
selection or consent. Public commands never accept a financial owner ID.

| Event | Required behavior |
| --- | --- |
| New or existing connection without explicit selection confirmation | No implicit import or automatic enrollment. Existing history remains available; require selection before the next import |
| No selected accounts | Pause local imports, perform no scheduled provider reads, and retain authorization and history. Explain that disconnect is the separate way to remove upstream access |
| Select all or a subset | Validate IDs against owned, supported discovery and the unchanged credential/discovery version. Confirm one versioned set, not one independent write per checkbox |
| A new provider account appears | Keep it unselected. Discovery never enrolls it or retains its financial facts |
| Deselect an account | Stop future ingestion, invalidate obsolete runs and preserve its last-good balance, movements, aliases, tags, receipts and allocations |
| Add or reselect an account | Disclose catch-up from the connection's original first-link Santiago day through today; this can include movements from the deselected interval |
| Same-identity relink | Retain selection, enrollment intent, IDs and original tracking boundary; invalidate old credentials/runs. Resume only after valid owned access, subject to backoff and budgets |
| Disconnect | Disable local work and invalidate claims/runs before remote cleanup; preserve history. Disconnect stays terminal. A later new connection starts unselected with a new tracking boundary |
| Missing, removed or newly unsupported selected account | Retain selection/history and report an actionable availability problem. Do not silently deselect it, synthesize zero data or commit an incomplete intended snapshot |

Do not reuse `account.active` for selection: current reads use that flag to hide
accounts. Retained accounts must instead expose selected/paused/disconnected
state beside their last known facts. Historical financial interpretation is not
changed merely because future ingestion stops.

Keep the existing [first-link tracking policy](../../../apps/api/src/banking/fintoc/README.md#tracking-starts-at-first-link):
inclusive Santiago accounting days, possible earlier movements on the first day,
no pre-link backfill and no synthetic opening transaction. Same-identity relink
does not reset that boundary. An oversized lifetime snapshot fails within the
existing limits; it is not silently shortened or split into financial commits.

Capture credential and selection versions before provider I/O. Begin validates
them under the existing user write lock. Preparation and commit bind both
versions, the run revision and the factual fingerprint. Commit independently
rejects account snapshots, movements, removals and suspensions outside the
selected set. Selection/lifecycle changes supersede the whole old run; never
re-prepare already-fetched data against a newly changed selection. Only the
existing bounded retry for a known rolled-back factual conflict remains valid.

## 3. Isolated synchronization boundary

The target is a cohesive banking subsystem with replaceable entry points, not a
generic jobs platform or a new microservice in this issue.

```text
Verified manual command       Timer adapter (later: queue/event adapter)
          |                                     |
          |                              Claim due owned work
          |                                     |
          +----------> Synchronization application boundary
                                  |
                        Existing ingestion workflow
                         /                     \
            Provider connector          Signed private RPC
            Fintoc transport            Scoped persistence commands
                                                |
                                           PostgreSQL
```

### Responsibilities and allowed dependencies

| Part | Owns | Must not own |
| --- | --- | --- |
| Trigger adapter | Wake-up, bounded work claims, shutdown/cancellation and calling the synchronization boundary | Fintoc mapping, selection decisions, financial writes, retry policy or an in-memory source of durable job state |
| Synchronization application boundary | An owned run, version capture, provider orchestration, existing fetch/prepare/commit sequence and typed outcomes | Browser sessions, Firebase verification, public controllers, application startup or scheduling timers |
| Pure policy/preparation | Tracking windows, eligibility, cadence/backoff calculations, normalized preparation and existing financial/tag decisions | Nest lifecycle hooks, HTTP listeners, process environment, SQL or provider I/O |
| Provider adapter | Fintoc credentials, fixed-origin transport, response validation, bounded discovery and normalized pages | User selection authority, schedule persistence, UI copy or direct database access |
| Persistence | Ownership, selection/consent, operational schedule/claims/budgets, leases, fingerprints and atomic commands | Provider calls, timers, financial interpretation or UI state |
| Public/status adapters | Authenticate user intent and render sanitized stored results | Provider calls on navigation/status reads, implicit enrollment or a second import algorithm |

Only three integration seams are needed: **trigger → synchronization command**,
**synchronization → provider connector**, and **synchronization → named private
RPC commands**. Keep typed run inputs/results and cancellation explicit. A
manual run gets its owner from verified authentication; a scheduled run gets it
from a durable server claim, never arbitrary trigger-supplied user data. Neither
entry point accepts prepared financial writes from the caller.

The shared engine reuses `FintocImportService`, `BankingIngestionService`,
`BankingConnector` and the existing persistence client/contracts. Do not fork
`prepare-sync.ts`, introduce a second normalization path, wrap every repository
in a compatibility gateway or put orchestration logic in shared Zod contracts.
The existing pure tag matcher is a real domain dependency; the worker must not
bootstrap the public tagging routers to reuse it.

### Hosting and extraction requirements

- Give synchronization its own feature-local Nest composition module. Separate
  it from public banking routers and the scheduling lifecycle adapter; share
  provider transport/admission rather than registering independent rate limiters.
- Keep scheduling policy and its timer adapter in a separate banking feature
  area. Its module can be omitted without disabling explicit selected-account
  synchronization. Stopping the timer cannot erase durable work.
- Provide a headless composition path for the same engine and adapters, without
  importing `AppModule`, public HTTP, Firebase, MCP, assistant or Angular code.
  Initially the timer may be hosted by the API; correctness cannot depend on
  that process remaining alive or being the only replica.
- Use the existing signed RPC boundary, not a new database pool in the worker.
  Keep serializable work metadata in internal contracts when it crosses a
  process boundary; no live service instances, raw tokens or provider pages in
  jobs. Backend-only connector types stay backend-owned.
- On future extraction, move the cohesive implementation and its tests to a
  genuine backend package or service owner, update consumers directly, and
  replace the composition/transport adapter. Do not import another app's source
  or leave two copies of ingestion behind. A framework rewrite is not required.
- A future separate deployment needs its own explicit signing authority,
  credential distribution and network review. Module portability is not
  permission to copy the API's broad signing key, grant owner database access or
  add a general administrator context.

Current code does not yet satisfy all these extraction requirements: in
particular, `BankingLinksModule` currently wires the public router and Fintoc
import together. LAZ-90 owns the composition split and its verification, while
preserving existing behavior. LAZ-89 adds no unused interfaces or packages.

## 4. Durable scheduling and background authority

Use a purpose-restricted `banking-scheduler` signed context, following the
existing strict context and private-procedure allowlist pattern. Its only work
authority is to claim a bounded set of eligible operational scheduling records.
It cannot read credentials, accounts, movements or profile/identity mappings,
edit enrollment, or call ordinary user/bootstrap/OAuth procedures.

Owner-scoped selection, lifecycle and synchronization commands maintain one
operational scheduling record per connection in their transaction. Keep owner,
connection, provider/mode, eligibility, next due time, failure streak, pause
reason and bounded claim/run references there, not financial payloads. The
registry's owner and eligibility derive from the owned connection. Scheduler
discovery must not add cross-user SELECT policies to financial tables.

Claims return only server-recorded owner/connection IDs, mode, versions and a
claim reference/expiry. Claims use an atomic, bounded database command; duplicate
wake-ups cannot claim the same work or exceed the deployment-wide background
capacity. The worker then invokes the shared engine with ordinary user-scoped
persistence. Begin rechecks the claim and live selection/credentials/lifecycle
before provider I/O; commit checks them again. A stale operational record never
authorizes importing financial data.

Keep these two leases distinct: a scheduling claim reserves execution capacity;
the existing five-minute ingestion lease/revision authorizes one financial run.
Bind the claim to that run so late workers cannot finish another worker's claim.
Use the existing per-user mutation lock for authoritative user changes, with
short operational claim/admission locks and a consistent lock order. Never hold
a SQL transaction or lock while contacting Fintoc.

The API remains a trusted user-asserting signer, as in the current security
model. Narrow scheduler permissions are not a claim to withstand compromise of
that trusted process. Separate-service deployment must review that trust rather
than treating a scheduling claim as an unrestricted impersonation credential.

## 5. Cadence, limits, recovery and source freshness

These are conservative **application defaults**, not a provider refresh SLA or a
verified commercial budget. Enforce durable limits across replicas/restarts.

| Control | Selected initial behavior |
| --- | --- |
| Operational enablement | Off by default. Require explicit operator enablement and valid matching-mode Fintoc configuration; confirm live plan/cost separately |
| Routine cadence | Next import one hour after successful completion, plus 0–5 minutes of jitter. First confirmed import can be due immediately. Missed intervals coalesce into one current snapshot, not a backlog of hourly replays |
| Wake-up/capacity | Wake every minute; claim only available capacity. Initially one background run deployment-wide. Fair due-time ordering and database claims prevent one replica or connection from monopolizing work |
| Provider request admission | At most two requests/second and two in-flight requests across Fintoc transport users in the deployment, including manual and background work. Shared durable admission uses only operational counters, not cross-user financial access |
| Read-volume budget | At most 1,000 synchronization/discovery provider requests per organization/mode per rolling hour. Both manual and background reads consume it. Lifecycle calls share rate admission but are not starved by this read-volume budget |
| Connection attempt budget | At most 30 acquired sync starts per rolling 24 hours, including first import, manual recovery, background work and retries. Coalesced/status calls are not starts; selection changes, relink and restarts do not reset the counter |
| Run/transport limits | Retain five-minute ingestion lease; 60-second total fetch budget; 20-second request deadline; 100 pages; 1,000-account inventory; 50,000 combined normalized records; 32 MiB normalized, 64 MiB private and 1 MiB provider-response limits |
| Financial commit | One atomic prepared commit for the intended selected snapshot. Never split, silently truncate or advance a checkpoint after partial failure |

Admission counts actual outbound requests, including failed requests. A denied
permit defers work without a provider call or a busy retry loop. Waiting for
admission consumes the existing run deadline; do not claim more work to bypass
it. Manual actions cannot bypass provider backoff or budgets. Provide sanitized
next-eligible information when capacity or quota prevents a run.

The volume/attempt bounds limit traffic, not Link subscription charges or a
currency-denominated bill. Record actual pricing and an acceptable Link/volume
budget before live enablement. Any raised limit needs an explicit operational
decision and capacity validation; the documented provider maximum is not the
default configuration.

### Failure and concurrency rules

- For transient failures, schedule four bounded retries after 5 minutes,
  15 minutes, 1 hour and 6 hours, with up to one minute of positive jitter. After
  five consecutive failed attempts, pause automatic work for explicit recovery.
  Use the later of application backoff, provider `Retry-After` and budget
  availability; do not clamp a provider waiting period downward. Do not add
  hidden transport retries on top of the durable retry policy.
- Persist completion/failure and next due time with the corresponding existing
  financial commit/failure transaction, bound to the run revision and claim.
  Success resets the failure streak; `needs_review` is a committed success with
  retained review work, not a failed import to replay repeatedly.
- An uncertain begin/commit/failure response requires readonly reconciliation of
  the claim and run. A request/correlation ID is not an idempotency guarantee.
  Do not resubmit a possibly committed mutation because its response was lost.
- A crashed worker leaves a durable claim/lease. Reconcile saved completion
  first; only after the relevant lease expires can a new claim/run supersede
  abandoned work. Old results/failures cannot update newer runs or schedules.
- Manual and automatic runs share ingestion leases, versions and budgets.
  Duplicate/concurrent requests coalesce, rather than creating separate
  financial execution paths. Selection change, relink, disconnect or access
  failure invalidates obsolete claims/runs and late schedule completion.
- Expired/revoked access pauses future imports until valid owned recovery.
  Invalid normalized data or an unavailable selected account pauses for
  investigation/recovery instead of retrying indefinitely. Configuration,
  organization entitlement and API-key failures are operator problems, not
  evidence that an individual user revoked access.
- Every failure retains last-good balances, movements, checkpoint, source times
  and manual decisions. A source that has not advanced is not by itself an
  import failure or a reason to increase the polling rate.

The operational disable switch stops new automatic claims/begins. Quiesce/drain
or cancel existing runs within their bounded lifetime; disabling cannot undo an
already committed import. Retain enrollment and due state so re-enablement
reconciles rather than recreates work. This is local automation control, not
provider-Link deactivation or a stop-billing promise.

### User-visible state

Expose selection/paused state, activity, last successful import, source balance
time, next eligible import/retry and a sanitized reason/action. Keep access,
automatic enrollment, worker activity and source freshness separate. The
existing 24-hour source-age policy remains: missing/future source dates or an
unknown value mean unknown freshness; a new fetch does not make an old balance
fresh. Paused/disconnected balances remain last-known facts, not current data.

Status/navigation reads are bounded, cancellable and provider-free. They never
select accounts, enroll, begin work or retry a mutation. Unknown mutation
outcomes reconcile through stored status before another explicit action.

## 6. Delivery ownership and planned verification

| Issue | Implementation responsibility |
| --- | --- |
| LAZ-86 | Owned bounded discovery, consent/versioned selection, persistence enforcement and invalidation, legacy explicit confirmation and retained account state |
| LAZ-90 | Isolated sync composition/worker boundary, durable scheduling, restricted claims/admission, budgets, backoff and correlated recovery through the existing ingestion path |
| LAZ-88 | Shared authorize → discover/select → confirm first import/enrollment journey; honest progress, cancellation and uncertain-result reconciliation |
| LAZ-87 | Selected/paused and automatic status, source age, next/retry facts and actionable recovery without hidden provider work |
| LAZ-97 / LAZ-85 | Reuse the guided flow in optional onboarding / implement aliases without changing provider identity or losing saved names on sync |

Acceptance must demonstrate the following; **none is execution evidence from
this documentation change**:

| Boundary | Required checks |
| --- | --- |
| Selection | No/all/subset selection, foreign/unknown IDs, unsupported/new accounts, stale discovery, explicit legacy confirmation and no unselected balance/movement retention |
| Concurrency/atomicity | Deselect/relink/disconnect before begin and during fetch/preparation/commit; obsolete removals/suspensions rejected; rollback retains last-good facts and user decisions |
| Background authority | Scheduler context cannot read finance/credentials/identity, edit enrollment, assert an arbitrary job owner or call other purpose/user procedures; poisoned/stale eligibility cannot authorize a run |
| Scheduling/recovery | Duplicate wake-ups, two replicas, shared manual/automatic lease, crash/restart, expired claims, completion-response loss and late old results; persisted due time/failure streak and deployment-wide limits |
| Resource/cost control | Rate/concurrency/read-volume/daily boundaries, provider `Retry-After`, exhaustion without provider calls, no restart/selection reset, enable/disable and bounded shutdown |
| Portability | Instantiate and test the engine without a timer, public HTTP, Firebase, `AppModule` or unrelated routers. Manual and timer adapters use the same behavior. Headless composition uses signed RPC and no database pool |
| Financial/reporting | First-link Santiago boundary and same-day precision; preserved aliases, tags, receipts, allocations, tombstones and history; stale/unknown source data independent of successful imports |

Use pure/unit tests for policy and orchestration, then real signed RPC and a
separately disposable PostgreSQL `_test` database for RLS, claims, budgets,
atomicity and races. UI/browser checks own progress, cancellation and recovery
presentation. Sandbox/live validation remains separately authorized under
LAZ-100; neither mocked providers nor a portable module establish live plan,
bank freshness, maximum-size performance or production-service readiness.

Update the current banking/security/contract/database/operations guides and
generated contracts with their implementing issues. Do not describe this design
as current runtime behavior or rewrite dated Stage B evidence as automation.
