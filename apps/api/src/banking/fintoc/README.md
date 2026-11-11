# Fintoc snapshot import and refresh (LAZ-51/LAZ-48)

`banking.importInitial({ id: connectionId })` is an authenticated, explicit API
command requiring confirmed nonempty account selection. It imports only selected
account snapshots and movements **from the connection's
first-link day in Santiago through today**. It does not backfill earlier days or
force a bank refresh. Reported balances do not depend on importing past transactions.
Authorization completion and `checkConnection` never import implicitly.
`banking.refresh` replays the same bounded snapshot with durable recovery/status
reporting. The web connection settings expose these commands explicitly (LAZ-62),
separately from authorization/access checks and the stored-balance page.
Optional automatic execution invokes this same path, off by default via
`BANKING_AUTOMATIC_SYNC_ENABLED=false`. It imports already available data roughly
hourly, not bank-forced refreshes. No payment or money-moving endpoint is used.

## Directory ownership

| Directory | Responsibility |
| --- | --- |
| `client/` | HTTP transport, pagination and raw Fintoc response schemas |
| `credentials/` | Owner-bound Link Token encryption/decryption |
| `discovery/` | Explicit bounded account choices; discard balances/raw numbers before persistence |
| `import/` | Owned snapshot import/reimport orchestration and first-link tracking policy |
| `snapshot/` | Operation-owned connector and neutral account/movement mapping |

Unit tests stay beside their implementation. Shared provider fixtures and
public/private RPC integration suites remain under `apps/api/tests/`.

## Explicit discovery and selected accounts

After authorization, call `banking.discoverAccounts({ id })` explicitly. It checks
owned active access/mode, reads Link plus account inventory within 60 seconds and
persists at most 1,000 choices: stable ID, product label, currency, last-four number
suffix and unsupported/removed reason. Provider balances are parsed transiently
but discarded. No financial account or movement is imported by discovery. Reads
of `banking.accountSelection` and synchronization status never contact Fintoc.

`banking.selectAccounts` atomically confirms account IDs and automatic enrollment
against selection/discovery/credential versions. It does not itself fetch finance;
the manual first-import command or eligible scheduler invokes the shared engine.
Unselected and new accounts are never imported or queried for movements. A missing,
removed or unsupported selected account fails the intended snapshot as
`account_unavailable`, preserving all last-good data rather than committing a subset.
Legacy connections start unconfirmed; no previous imported row implies consent.

Deselecting or selecting nothing preserves history, aliases and user decisions;
`account.active` is not changed. Stored account reads distinguish tracked/paused/
disconnected facts. Same-identity relink retains intent and the original tracking
day while invalidating obsolete credentials/runs; selecting again catches up the
first-link-to-today window, including the deselected interval. Disconnect remains
separate and terminal. Selection does not deactivate Fintoc collection or billing.

## Tracking starts at first link

`fintocTrackingWindow` derives the inclusive `since` date from the owned local
connection's immutable `createdAt`, not the upstream Link's age, the application
user's age, the last successful sync or the current token version. `until` is the
current Santiago day. Each connection has its own start; ordinary refresh and
same-identity relink preserve it. Terminal disconnect followed by a new connection
creates a new start. The public commands still accept only the connection ID, not
a client-selected date or a historical-import option.

Fintoc reliably supplies an accounting **day**, not an exact transaction-time
cutoff. The first-link day is included, so movements earlier on that same day may
appear. `transaction_date` is not used to pretend otherwise. The UI explains this
precision before authorization and beside synchronization controls.

The starting financial position is the independently reported balance. No opening
transaction is synthesized and no complete bank history is reconstructed. A pull
can successfully return known balances with zero tracked movements; missing/card
balances remain unknown rather than zero or invented debt. Classification and
income confirmation keep their existing explicit eligibility rules.

The old 90-day pre-link backfill is removed. Already imported records, user
decisions, receipts, allocations and observed history bounds are not deleted or
reclassified. Records booked before the first-link day are outside future fetches,
so those older retained records are not refreshed by this policy. Importing earlier
history is a future explicit product flow; no month/payroll exception is implemented.

Each explicit pull currently replays the tracked first-link-to-today period, not an
incremental cursor or a silently truncated rolling window. Existing page/record/
byte/time limits still fail oversized runs atomically. Long-running connection
history may eventually need a separate bounded catch-up/correction strategy; this
policy does not claim a successful maximum-size or multi-year load benchmark.

## Ownership and transport

`FintocImportService` reads the owned private credential projection, verifies the
configured mode and active/local connection, then decrypts server-side. It creates
one `FintocSnapshotConnector` per operation and passes the captured credential
and selection versions to `BankingIngestionService`. Private `providerSync.begin`
checks both versions, nonempty consent and any background claim under the user
write lock **before** attempt metadata or provider I/O. Commit rechecks versions,
claim/lease/revision and rejects unselected facts, removals and suspensions.
Relink in the secret-read/begin gap returns `superseded`; later lifecycle changes
invalidate the sync revision. Foreign IDs never reach Fintoc.

The adapter verifies Link identity/mode/holder and access, paginates accounts, then
only selected supported accounts' movements. Every normalized page makes at most one
upstream request. Requests use the fixed `https://api.fintoc.com` origin,
`Fintoc-Version: 2026-02-01`, `per_page=300`, integer `page` and
`confirmed_only=false`. Returned pagination URLs are inspected but **never
requested**. Movement requests retain server-selected inclusive `since`/`until`
dates throughout pagination; out-of-window records fail instead of silently
changing the requested scope. The requested window is disclosed in the result.
Invalid/backward next pages, duplicate IDs within a collection,
inconsistent totals or incomplete declared counts fail the entire run. A full
headerless page requires an additional page; a short headerless page terminates.
An explicit terminal Link header can finish a full page. Without provider pagination metadata, the adapter cannot prove that an upstream
short page contains everything the bank could expose.

Transport retains the 20-second per-request deadline, 1 MiB response ceiling, no
redirects/cache and no automatic retries. An inventory is limited to 1,000 accounts
(including unsupported ones). The shared 100-page, 50,000-normalized-record,
32 MiB normalized and 64 MiB private budgets still apply; the Link check and
inventory pages count toward the 100-page limit. Oversized/incomplete runs never
split a financial commit. No incremental checkpoint is invented (`null`).
Fintoc requests receive the shared 60-second whole-fetch cancellation signal too.

All transport entry points share database-backed admission: two starts per rolling
second, two in-flight requests, and 1,000 sync/discovery reads per mode per rolling
hour. Lifecycle calls share rate/concurrency but not the read-volume quota. A
25-second permit bounds reserved capacity on response/release loss; admission waits
consume the 20-second request deadline. No permit means no provider request.
Valid future `Retry-After` is persisted per provider mode, without shortening it;
owned discovery failure also stores a connection read wait (provider time, or five
minutes when absent). Begin and discovery honor durable read waits across restarts.
There is no in-memory-only limiter or alternate manual path around these controls.

## Financial mappings

| Fintoc fact | Neutral meaning |
| --- | --- |
| CLP `checking_account`, `sight_account`, `rut_account` | `checking` cash account |
| CLP `savings_account` | `savings` cash account |
| Cash `balance.current` | Exact signed reported balance, independently of movement history |
| `refreshed_at` | Source-confirmed balance time when supplied; fetch observation is separate |
| CLP `credit_card` | Card account/movements retained; liability balance unknown |
| Card `available`, `limit`, generic `current` | Never mapped to debt or available cash: the documented generic accounting amount does not establish a card-liability sign convention |
| Foreign currency, line of credit, unknown product, removed account | Explicit skipped-account reason; no conversion, product substitution or deletion of existing history |
| Movement `id` / account `id` | Stable opaque scoped identities; never description/date/amount/number matching |
| Integer movement `amount` | Exact CLP pesos as canonical two-place decimal; negative debit, positive credit, including cards |
| `post_date` | Calendar day in America/Santiago; never timezone-convert midnight UTC |
| `transaction_date` | Not used as booking/correction time; some institutions return local time with a misleading `Z` suffix |
| `confirmed` and `pending=false` | Booked movement |
| `pending=true` / `processing` | Not booked; counted separately. A previously booked fact is suspended without deleting decisions and can recover on provider confirmation |
| `reversed` / `manually_reversed` | Explicit keyed reversal/tombstone, even if the original was never imported |
| Description | Bounded description only; not a trusted merchant identity |
| Transfer counterparties | RUT hint when structurally valid, never proof of same ownership or an internal pair |

Unsafe/fractional/out-of-range amounts, missing stable IDs/statuses or invalid
posting dates fail atomically rather than round or skip a financial fact. A
missing cash balance is unknown, not zero. Older or undated source snapshots cannot
replace an already source-dated balance/freshness. Account history is always
`partial`, with the returned booked-date range when present; neither complete
pagination nor the sum of imported movements establishes a current balance.

No Fintoc field here reliably establishes a paired internal transfer/card payment
or an ordinary merchant purchase. The adapter does not guess from descriptions,
same-holder hints, matching amounts or dates. Imported movements therefore have
unknown provider internal assessment. They remain visible as unresolved movements
and do not silently count as spending/income. Existing explicit internal/external
choices and tags survive reimports. A positive credit or salary-like description
never creates a confirmed income receipt. The existing owned classification and
income-confirmation commands supply those user decisions.

## Results, replay and limits of this slice

Completion returns `complete` or `needs_review`, conflict count, and a bounded
report: requested history window, supported accounts, booked/reversed records, pending/processing exclusions,
uncertain-evidence count, skipped-account reasons and unknown card-balance IDs.
These are **examined provider-record counts**, not newly inserted rows or the
number still unclassified after user overrides. No raw payload, credential, Link
Token or private checkpoint is returned. Failure returns only its sanitized reason
and optional retry time; a partial report must not look committed.

Repeated explicit imports use the shared atomic ingestion path. Provider facts
upsert on the same identities, preserving aliases, manual classification/tag
decisions, receipts and tombstones. An absent record is not a removal. Only a
completed run advances success metadata; a late-page failure preserves last-good
balances, movements, success time and checkpoint. Known stale preparation may be
recomputed; ambiguous provider/persistence mutations are never automatically
replayed. API-key failures/outages are not evidence of user revocation.

This connector is not a webhook consumer or incremental-cursor implementation.
The separate scheduler invokes the same import service; it does not add mapping
or financial-write logic here.
It does not request Fintoc refresh intents, prove complete bank history, automatically
pair transfers, establish card debt or reactivate permanent tombstones. Only explicit
reversed records cause removals; absent records and webhook-only deletion events
are not inferred from a snapshot. Retained records from before the first-link day
are not refetched by this mechanism.

## Refresh and recovery (LAZ-48)

The selected mechanism is an **explicit pull of data already available at Fintoc**.
`banking.refresh({ id })` uses the same owned snapshot import path as
`banking.importInitial`. Neither command forces Fintoc to scrape the bank, and a
successful import can truthfully leave stale/unknown bank-source freshness. Refresh
may also perform the first import when a linked connection has no imported data.

Apply migration `202611080026-provider-sync-recovery` before running this backend.
It adds a nullable lease timestamp and the `provider_unbooked` conflict reason,
without resetting existing data or starting work. Its downgrade refuses to discard
provider-unbooked audit records. Existing credential/encryption settings stay stable.

`providerSync.begin` acquires a five-minute lease and revision under the user write
lock. Duplicate attempts return `in_progress` with the existing expiry; a persisted
provider backoff returns `retry_later`. Neither starts provider I/O or rewrites the
attempt time. Successful commit and recorded failure end the lease and invalidate
the finished revision. Relink/disconnect/status changes invalidate old runs too.
Expired/revoked sync outcomes advance the credential version, so an older access
check cannot reactivate a connection based on a stale result.

If a process or private response is lost, the bounded lease eventually becomes
`interrupted`. A new explicit attempt can claim a new revision; late results or
failures from the old run cannot overwrite it. Status reads are readonly and never
resume work. The optional worker can start a new eligible run after expiry/backoff,
but never replays an unconfirmed begin/commit/failure mutation. Callers reconcile
uncertain results through stored status before another explicit attempt.

An explicitly pending/processing movement that was previously booked retains its
amount/date, tags, user internal/external choice, receipt and expense allocations.
Its provider suspension excludes it from financial totals until confirmed again.
Provider confirmation resolves **only** the suspension. Other incompatible receipt
or classification conflicts stay open. Never-booked pending records create no
transaction, and missing records do not erase prior history.

A terminal reversal resolves the temporary suspension and retains its audit. A
linked income receipt still creates the separate removal conflict. Neither an
ordinary replay nor later provider confirmation reactivates a permanent tombstone.

`banking.syncStatus({ id })` returns lifecycle, activity (`idle`, `in_progress`,
`interrupted`), last attempt/success/result, sanitized failed-attempt/backoff facts,
current conflict and provider-suspension counts, and bounded per-account freshness/
history facts. Access, last successful fetch and source age are independent.
Application freshness policy is 24 hours: a known source-dated value is fresh below
that age and stale at/above it; unknown values/dates and future source dates are
unknown. This threshold is an application policy, not a Fintoc refresh SLA. Any stale
account makes the aggregate stale; otherwise unknown accounts make it unknown.
`canRefresh` describes stored lifecycle/lease/backoff eligibility, not a guarantee
that server configuration or the provider is available.

The [web connection settings](../../../../ui/README.md) consume these statuses
rather than treating access checks, successful network calls or an old balance as
proof of fresh financial data. A single selected panel reads status without
provider I/O. Manual import/refresh requires an explicit action; enrolled background
work is separate. Uncertain manual responses require a new readonly status check
before another attempt.

## Automatic host and operations (LAZ-90)

Apply additive migration `202611100030-provider-automation` before using discovery,
selection or scheduling; it preserves existing accounts/history and leaves legacy
selection unconfirmed and automation unenrolled. It adds operational selection,
schedule, admission and per-mode backoff records plus run-version/claim fields.
It refuses destructive downgrade. Never reset user data to enable this feature.

`BankingSyncModule` has no timer/public-router dependency; `BankingSchedulingModule`
owns the runner and timer. The API composes that module; after building, the same
headless host is `pnpm --filter api worker:banking`. Set matching Fintoc keys,
encryption key, signed private-RPC URL/key and `BANKING_AUTOMATIC_SYNC_ENABLED=true`
in its process environment. It opens no HTTP listener or database pool and imports
no `AppModule`, Firebase, MCP or assistant. This is a portability boundary, not a
separately hardened deployment: review distinct signing authority and credential/
network distribution before future extraction. Do not copy broad API signing
authority into an independently trusted worker without that review.

The timer invokes one bounded claim immediately and then waits 60 seconds after
settlement. Multiple API/headless replicas share durable claims; one background
run is reserved globally, with due-time ordering and row-lock `SKIP LOCKED`.
Daily budget exhaustion moves the due time and releases the claim so other work
can proceed. Other abandoned claims expire within five minutes; a claim must
match the live ingestion revision/lease before committing or completing schedule.
Manual and background work share a 30-start rolling-24-hour connection budget;
coalesced/readonly calls do not consume starts. Relink/selection/restart do not
reset this budget. Success schedules one hour plus 0–5 minutes jitter. Retryable
failure waits 5/15/60/360 minutes plus 0–1 minute jitter, respecting later provider
waits; five consecutive failures pause automation. Invalid data, account
unavailability and access failures pause it without blind retries. Explicit
successful recovery clears failure state; pause is not erased by checkbox toggles.

Operational disablement retains consent/history and stops new automatic claims/
begins. Drain or shut down bounded existing work; disablement is not rollback,
provider deactivation or a stop-billing action. No new live entitlement, plan/cost,
billing, bank freshness or manual/browser acceptance verification is claimed.
See the [policy and acceptance gates](../../../../../docs/planning/stage-c/banking-sync-policy.md).

## Verification and references

Typed provider fixtures and colocated tests cover mapping, dates, amounts, safe
pagination, exclusions and sanitized failures. The integration suite
`tests/integration/banking/fintoc-import.integration.spec.ts` uses a mocked provider
through actual public authentication, signed private RPC and restricted-role
PostgreSQL. It reconciles independent balances, uncertain financial interpretation,
explicit spending/income decisions, repeat import, user isolation, failed-page
atomicity and lifecycle races. Use a fresh disposable database and non-default/
ephemeral listeners; see the [verification tiers](../../../../../docs/technical/development-workflow.md#verification-tiers).
Mocked-provider tests are not evidence of live-bank consent or production readiness.
`fintoc-refresh.integration.spec.ts` additionally covers readonly ownership,
coalescing, abandoned-lease recovery, provider backoff/outages, expired/revoked
access, stale access-check rejection, pending/processing recovery, unrelated
conflict preservation and retained refund allocations.
`fintoc-tracking.integration.spec.ts` verifies the first-link boundary, an older
application user, independent balances with zero movements, stable relink/refresh
dates and preservation of existing pre-link decisions/receipts. Its provider
fixture honors requested booking dates; only the policy observation clock is fixed.

An isolated upgrade from migration 025 to 026 preserved all 24 application tables,
including 1,052 demo movements, 37 receipts, fixture credentials and sync facts,
RLS policies and grants. An unused downgrade/reupgrade succeeded; a downgrade
with even a resolved provider-unbooked audit row was rejected atomically. This
used a fresh disposable database, not the configured review database.

### First-import sandbox evidence — 8 November 2026 (LAZ-51)

This dated check used the former 90-day policy. It is transport/mapping evidence,
not verification of the newer first-link tracking boundary.

A disposable hosted Widget authorization at an unoccupied sandbox institution
exercised the real provider through public authentication, signed private RPC and
a restricted PostgreSQL login in a fresh separate database. The explicit
11 August–8 November window imported one checking account and 387 booked movements
(pages of 300 and 87). Reported balance and source freshness were known. Repeating
the import completed and retained the checked first-page 100 movement identities.
Disconnect completed remote cleanup; all four pre-existing provider Links were
retained. Only disposable Links created by the verification harness were removed.
Temporary non-default/ephemeral listeners, database and dedicated runtime login
were cleaned up afterward. No local environment/encryption settings were replaced.

This verifies a real sandbox first import and sampled replay identity, not card
liability conventions, automatic transfer recognition, live-bank consent, refresh
recovery, maximum-size commits or production readiness.

### Refresh sandbox evidence — 8 November 2026 (LAZ-48)

This dated check also predates the first-link policy. Its recovery/identity evidence
does not imply that new connections still backfill the preceding 90 days.

A new disposable hosted sandbox authorization imported three cash accounts and
707 booked movements in the same 11 August–8 November window. Explicit refresh
retained all 707 checked movement identities and source timestamps matched the
provider, not the fetch clock. Status reads made no provider call; a gated live
refresh exposed its durable lease and a simultaneous command coalesced without
another provider request. A deliberately injected 503 preserved last-good success,
account-source facts and movements, then a new live snapshot recovered cleanly.
The outage was fault injection, not a naturally observed Fintoc failure.

Disconnect retained local history and completed remote cleanup. All four existing
provider Links were preserved. Both sandbox attempts cleaned up only their own
disposable Links, databases, logins and ephemeral listeners; the first attempt's
strict unchanged-dataset assertion was replaced with retained-identity checks
because the provider returned additional records between pulls. No application
environment/encryption setting was changed. These checks do not establish live-bank
consent, webhook/scheduled behavior or maximum-size commit/load performance.

Provider references reviewed 8 November 2026:
[accounts](https://docs.fintoc.com/api/movements-api/accounts/accounts-object.md),
[movements](https://docs.fintoc.com/api/movements-api/movements/movements-object.md),
[pagination](https://docs.fintoc.com/api/fintoc-api/pagination.md),
[version pinning](https://docs.fintoc.com/guides/home/upgrade-api-version.md).
