# Banking connector boundary (LAZ-47)

Current implementation: provider-neutral contracts, owned ingestion, the
[Fintoc linking/lifecycle backend](linking/README.md) (LAZ-49), and the explicit
[Fintoc snapshot import/refresh](fintoc/README.md) (LAZ-51/LAZ-48). Durable attempt
leases, recovery and source-freshness reporting supply the explicit web controls
in bank settings (LAZ-62), independently of the stored-balance page.
See the [database model](../../../../docs/technical/database-model.md),
[private RPC/RLS](../../../../docs/technical/persistence-security.md) and
[RPC inventories](../../../../docs/technical/rpc-contracts.md).

**Selected-account synchronization (LAZ-74):** the
[LAZ-89 synchronization policy](../../../../docs/planning/stage-c/banking-sync-policy.md)
records the decision and delivered boundaries: explicit discovery/versioned
selection, optional automatic enrollment and scheduled available-data imports.
Automation defaults off; no bank-forced refresh is added. Verification of the
current regressions and live entitlement/cost remains a separate gate.

## Selection, automation and portable composition

Authorization imports nothing. `banking.discoverAccounts` explicitly reads a
bounded inventory and persists only stable IDs, product/currency, last-four number
suffix and support/availability reasons. Raw balances are discarded; unselected
and newly discovered accounts never create financial facts or movement requests.
`banking.accountSelection` is provider-free. `banking.selectAccounts` confirms one
owned set plus `automaticEnrolled`, using expected selection/discovery versions
and the discovery's credential version. Empty selection pauses imports. Existing
connections also require confirmation before their next import.

Selection changes supersede old runs. Begin and commit bind credential/selection
versions, revision and claim; commit independently rejects accounts, movements,
removals and suspensions outside the selected set. Missing/unsupported selected
accounts fail the whole snapshot as `account_unavailable`, rather than silently
shrinking it. Deselecting retains balances, movements, aliases and decisions.
`account.active` remains independent of selection; stored account reads expose
`tracked`, `paused` or `disconnected` alongside last-known facts. Reselecting
catches up from the original first-link Santiago day, within existing run limits.

`BankingSyncModule` composes `FintocImportService`, discovery and the existing
`BankingIngestionModule`, without public routers, auth, timers or listeners.
`FintocModule` owns shared transport/credentials/durable admission.
`BankingSchedulingModule` separately supplies a one-run runner and timer; the API
hosts it, or the same headless composition runs after a build with
`pnpm --filter api worker:banking`. No `AppModule`, Firebase, MCP, assistant,
public HTTP listener or database pool is bootstrapped by that command. Manual and
scheduled work reuse the same connector, preparation and atomic commit—not a
second ingestion pipeline. Future extraction must move this cohesive owner and
replace composition/transport, not import another app's source or duplicate logic.
Review separate signing authority, secrets and network trust before deployment as
a distinct service; the current trusted API signer can assert ordinary users.

Set `BANKING_AUTOMATIC_SYNC_ENABLED=true` only with valid matching-mode Fintoc
configuration and explicit operational approval. It defaults `false` in API and
Compose. The timer wakes immediately, then 60 seconds after each invocation settles;
each invocation claims at most one due connection. Database claims support multiple
replicas/hosts with one globally reserved background run, due-time ordering and
`FOR UPDATE SKIP LOCKED`; correctness does not rely on a singleton JS process.
Success schedules one hour plus 0–5 minutes jitter, not missed-hour replay jobs.
Daily quota deferral advances due time and releases the claim; other abandoned
claims remain bounded by their five-minute expiry. Manual and automatic starts
share leases and 30 starts per connection per rolling 24 hours.

All Fintoc calls share durable two-starts/second and two-in-flight admission;
sync/discovery reads additionally share 1,000 requests per mode per rolling hour.
Lifecycle requests do not consume that read quota. Request permits expire after
25 seconds; waiting consumes the request/run deadlines. Valid provider
`Retry-After` is persisted per mode, and discovery/read backoff is persisted per
connection, so restart or a different entry point cannot evade waiting periods.
Retryable runs back off 5/15/60/360 minutes plus up to one minute jitter, never
earlier than provider waiting time; five consecutive failures pause automatic
work. Access, invalid data and unavailable selected accounts also pause it.
A successful explicit recovery resets the streak; no ambiguous mutation is replayed.
Disabling stops new automatic claims/begins, not committed work or upstream billing.

Access, selection/enrollment, worker activity, last success and bank-source
freshness remain distinct. Successful import does not advance an old source time.
Live plan/update cadence, billing/cost, real bank freshness and the manual/browser
acceptance gate remain unverified by this implementation description.

`connector/banking-connector.ts` is the backend-only shape implemented by provider adapters. The validated data shapes live alongside it in `connector/normalized-banking.schema.ts`; they are not HTTP or cross-application contracts. An ingestion service verifies the user and connection before calling `fetchPage`, then validates each returned `ConnectorResult` before persistence. The adapter obtains provider credentials server-side. Linking a connection is a separate provider capability and need not share a provider-specific callback shape with synchronization.

## Financial meanings

- External account IDs are opaque and scoped to a connection; external movement IDs are opaque and scoped to an account within that connection. Persistence keys are `(connectionId, externalAccountId)` and `(connectionId, externalAccountId, externalMovementId)`. Numbers, aliases, masked card numbers, amount/date/description, and pagination cursors are not account or movement identities. The same external ID in two accounts or connections is valid. Missing stable IDs are invalid input.
- Account `reportedBalance` is an independent source snapshot, not the sum of imported movements. `null` means unknown; a partial movement history cannot supply a zero or current balance. `asOf` is the time the provider confirmed that value, if known; `observedAt` is when the page was fetched. A fresh fetch with no new balance does not update balance freshness. `historyCoverage` states whether a specified window is complete, partially available, or unknown; it does not assert that all historic movements exist.
- Checking/savings `cash_balance` is signed cash; a card's `card_liability` uses the core convention of a negative amount owed, potentially positive when overpaid. Remaining card credit and credit limits are different amounts, never mapped to `card_liability`. CLP amounts are canonical decimal strings with two places. Booked debit amounts are negative and credits positive on all account types; direction is derived from the sign.
- `booked.precision = instant` carries the actual UTC booking instant. `calendar_day` retains a provider's date-only value in the Santiago calendar without inventing a time in the adapter. When mapping to the existing `transaction.bookedAt` timestamp in LAZ-50, choose a consistent local midday in America/Santiago and retain the original date precision. Pending movements are not booked movements and must not enter this contract as transactions. `providerUpdatedAt` is the provider's correction time, when known; the page's `observedAt` is fetch provenance rather than a booking time.
- `providerKind`, `counterpartyHolder`, and `relatedMovement` are evidence, not user-confirmed classifications. A provider calling something a transfer does not prove it is between two accounts the user owns. Only a verified same-owner match, a known owned-account pair, or a user decision can mark it internal; unknown stays unknown and should remain distinguishable from confirmed external. Transfers and card payments still affect each account balance but must not count as earned income or purchase spending once confirmed internal. A *separate credited movement* linked by `relatedMovement.kind = reversal` may describe a refund; this is different from `removedMovements`, which retracts a previously booked fact. Neither event alone settles gross/net budget behavior.
- Provider-owned fields include account identity/type, reported balance, movement identity/amount/date, descriptions and source relationships. User-owned fields include account alias, a transaction's optional single tag, manual internal-movement decisions, confirmed income receipt/source and later refund/savings interpretations. The adapter never assigns a tag or confirms income because a credit resembles salary. A correction to provider facts updates only those facts; incompatible sign/ownership changes require explicit review of preserved user decisions in LAZ-50, rather than silently rewriting them.

## Sync semantics

`fetchPage` receives the last **committed checkpoint** and a separate within-run `pageCursor`. Each successful page provides either `nextCursor` for the next page or `complete: true` with a candidate `checkpoint` for the next refresh (null if the provider has no incremental cursor). The ingestion service keeps the previous checkpoint throughout pagination and commits the candidate only after the intended run completes. Replaying a page upserts by the scoped external IDs; changed provider facts update the same records, without clearing user decisions. Missing movements in a page or incomplete history window are not deletions. Actual provider removals/reversals arrive as `removedMovements` keyed by account and movement external ID, even if the provider supplies no amount/date with the event. Ingestion must retain the record and its user decisions, exclude it from financial totals, and apply repeated removals idempotently; later upserts must not resurrect a removed item without verified provider reactivation. `failure` distinguishes retryable errors (optionally with `retryAfter`), expired access, revoked access, and invalid normalized data. A failure or incomplete run must not erase the last confirmed balance/success time or advance the committed checkpoint. Connection lifecycle and balance age are different state dimensions: an active connection may have stale or unknown balance freshness; LAZ-48 defines freshness thresholds and reporting.

## Handoff

Fixtures exercise this boundary without a provider SDK. Kysely tables in `apps/persistence/src/finance` store connection-scoped identities, nullable balances/status, date precision/coverage, provenance, tombstones and sync revisions under user RLS. The API interprets factual aggregates; removed/unresolved movements cannot count as confirmed spending/income. Linking, provider-specific mapping, refresh reporting and savings eligibility remain distinct capabilities. Refund/reimbursement allocations are explicit user commands, never inferred by this connector; their [original-purchase attribution rules](../../../../docs/technical/rpc-contracts.md#expense-recovery-semantics) leave provider facts and balances unchanged.

## Owned ingestion (LAZ-50)

`BankingIngestionService.syncForUser` calls private `providerSync.begin` before fetching. Begin acquires a five-minute revision-bound lease or returns the existing in-progress/backoff state without changing attempt metadata. The service validates all pages outside SQL, reads a consistent bounded factual snapshot, then `prepare-sync.ts` computes classification and tag decisions. `providerSync.commit` rechecks the live lease, revision and fingerprint under the common user write lock and commits accounts, movements, tombstones, conflicts, decisions/events and checkpoint together. Rules added/removed between preparation and commit invalidate the fingerprint too. Concurrent/obsolete runs return `in_progress`/`superseded`; only known stale-input rejections are recomputed. Failures never change last-good financial facts/checkpoints. Limits are 100 pages, 50,000 records, 32 MiB normalized JSON and 64 MiB private request/result JSON; an oversized run fails atomically rather than being split. Fintoc fetches also honor a 60-second whole-fetch budget.

Account snapshots preserve user aliases and distinguish a missing balance from a reported zero. Provider balance times are separate from observation times; an older observation or source balance does not replace a newer one. Date-only bookings map to Santiago local noon while retaining `bookedOn` and date precision. Existing provider amounts, dates, descriptions and source evidence are updated on the same movement ID; user tags, confirmed income receipts and user internal-status overrides stay attached. A proven same-owner, opposite-sign pair is internal; unpaired transfer/card-payment hints remain unknown. Merchant-bearing ordinary purchases may be treated as external, but this hint cannot override a user-confirmed internal decision. Income is never auto-confirmed from a positive amount.

An incompatible correction updates the bank fact but preserves and suspends the user interpretation. `provider_movement_conflict` records the old and new relevant facts for review, and `transaction.review_status = needs_review` excludes that movement from totals while contributing to the unresolved-movement warning. A removed movement is likewise excluded and its receipt link retained for review. Completed runs with open conflicts advance the checkpoint **only after** conflicts are durable and report `needs_review`; they are distinct from clean completion and from failed attempts. `listPendingReviewForUser` provides owned transaction, tag and income-source references for a later user-facing review/tag-assignment workflow. Resolving conflicts and editing transaction tags are separate management actions; this service does not silently rewrite user decisions.

Expense allocations likewise remain attached on corrections/removals. Recovery
reads compare the confirmed amounts and exact booking instants with current facts
and eligibility; incompatible links become `needs_review` without reducing spending.
They are not silently deleted, reallocated or converted to income by ingestion.

`transactions.setInternalMovement` is the owned correction command. Boolean values
set a user override; null returns to the stored assessment, including unknown.
It resolves only relevant classification/compatible-credit conflicts and retains
receipt/expense links for dynamic eligibility checks. An explicit choice against
known internal evidence records an acknowledgement; unchanged replays do not open
the same disagreement again. The joined acknowledgement is fingerprinted with sync
facts. Unrelated review states and provider removals are not cleared by this command.
No source booking, amount, balance, relationship or tag is rewritten.

### Private command sequence and failure boundaries

| Step | Private procedure | What happens |
| --- | --- | --- |
| Begin | `providerSync.begin` | Verify ownership/provider/status/credential version; acquire a bounded lease or coalesce/defer without provider I/O |
| Fetch | None | API calls/validates the connector outside SQL, retaining the committed checkpoint throughout pagination |
| Snapshot | `providerSync.facts` | Repeatable-read bounded relevant facts/rules and canonical fingerprint; POST override supports large scope keys |
| Prepare | None | API computes owned-pair evidence, booking conversion, corrections and tag proposals |
| Commit | `providerSync.commit` | Under user write lock, reject stale inputs and atomically persist authoritative changes/checkpoint |
| Failure / review | `providerSync.failure` / `providerSync.review` | Finish the lease with failed-attempt metadata separately / read owned unresolved conflicts |
| Status | `providerSync.status` | Repeatable-read owned lifecycle, attempt, bounded account-source facts and provider-suspension count |

The sync revision orders competing runs; the factual fingerprint catches user,
rule and relevant persisted changes between snapshot and commit. These are
different checks. A superseded revision does not overwrite newer work. Only a
known conflict rejection is read/prepared again (at most two retries); a lost
response or timeout is not retried because the commit may have succeeded.

Movement snapshot rows already include their account external ID, receipt
existence and internal-override acknowledgement from SQL joins. These fields participate in the fingerprint and are
re-read on commit; the API does not rebuild them from separate arrays. Rule
matching indexes each immutable rule snapshot once, and commit validation reuses
the revalidated rule set through an ID lookup. See the
[read pattern](../../../../docs/technical/persistence-reads.md).

The 50,000-record bound counts **accounts + movements + removals + temporary suspensions across all
pages**, including repeated records on separate pages. UTF-8 serialized normalized
pages also share a cumulative 32 MiB budget; private prepared bodies and factual
results have a 64 MiB budget. Repeated cursors, incomplete pagination, decreasing
page observation time or invalid normalized data fail the run. The service does
not silently split an oversized run or advance its checkpoint after a partial
financial import. Begin/failure attempt metadata is separate from the atomic
financial commit, so "no partial writes" does not mean no attempt was recorded.

`banking.importInitial` and `banking.refresh` explicitly import current Fintoc
accounts and movements from that connection's first-link Santiago day through
today, without pre-link backfill. Same-day earlier movements may appear because
booking precision is a calendar day, not a trustworthy transaction timestamp.
Refresh replays the tracked period under the existing resource limits, not an
incremental cursor or bank-forced refresh. The optional scheduler invokes this same
selected-account path. Balances remain independently
reported; zero tracked movements do not require an invented opening transaction.
Begin honors persisted provider/read `retryAfter` and durable attempt budgets.
An expired unfinished lease is reported as `interrupted`; eligible new manual or
scheduled work can acquire a new revision without replaying an uncertain mutation.
Linking/access checks and status reads
never start financial imports.
The first import binds the owned decrypted credential's version to `begin`; a
relink between secret lookup and begin returns `superseded` before provider I/O.
Fintoc begins without that version are rejected. Later relinks/disconnects continue
to invalidate facts/commit/failure through the sync revision. A private review read
is not a delivered review-resolution UI.
The local first-link `createdAt` is preserved by same-identity relink. Historical
imports before that day remain a future explicit flow. Previously imported records
and their decisions are retained, not deleted or silently reclassified.

### Temporary unbooking and reporting (LAZ-48)

`suspendedMovements` represents explicit pending/processing states, not deletion by
absence. Previously booked records retain all source facts and user decisions but
receive a `provider_unbooked` conflict and `needs_review` exclusion. No transaction
is created for a never-booked pending record. New provider confirmation resolves
only that suspension; unrelated conflicts remain. Tags, receipt links and expense
allocations are retained throughout, and eligibility is re-evaluated from the
current confirmed facts. Permanent removal tombstones are never implicitly undone.

`banking.syncStatus` reports access, attempt activity, last success/failure and
bank-source freshness separately. A source-dated known balance is fresh for less
than 24 hours, stale thereafter, and unknown without a value/source date or with a
future source date. Fetch success is not source freshness. Per-account history
remains partial; known partial bounds are retained/extended, not erased by an empty
replay. Provider suspension counts distinguish awaiting-bank exclusions from other
review conflicts. See the [Fintoc guide](fintoc/README.md#refresh-and-recovery-laz-48).

### Verification scope

Connector fixtures and API unit tests cover parsing, orchestration, byte/count
bounds and no ambiguous replay without a real provider. Real-PostgreSQL integration
tests cover ownership, correction/removal preservation and atomic commit through
signed RPC. See [test tiers](../../../../docs/technical/development-workflow.md#verification-tiers)
before running them: integration checks open listeners and need disposable test
data. Payload measurements in `scripts/measure-sync-payload.mjs` measure JSON size,
not successful maximum-size database commits, representative RLS load or live
provider readiness.
