# Banking connector boundary (LAZ-47)

Current implementation: provider-neutral contracts, owned ingestion, the
[Fintoc linking/lifecycle backend](linking/README.md) (LAZ-49), and the explicit
[Fintoc first snapshot import](fintoc/README.md) (LAZ-51). Refresh/recovery and
UI import/refresh controls remain separate unfinished slices.
See the [database model](../../../../docs/technical/database-model.md),
[private RPC/RLS](../../../../docs/technical/persistence-security.md) and
[RPC inventories](../../../../docs/technical/rpc-contracts.md).

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

`BankingIngestionService.syncForUser` calls private `providerSync.begin` before fetching. It validates all pages outside SQL, reads a consistent bounded factual snapshot, then `prepare-sync.ts` computes classification and tag decisions. `providerSync.commit` rechecks revision/fingerprint under the common user write lock and commits accounts, movements, tombstones, conflicts, decisions/events and checkpoint together. Rules added/removed between preparation and commit invalidate the fingerprint too. Concurrent completed runs return `superseded`; only known stale-input rejections are recomputed. Failures never change the last-good financial facts/checkpoint. Limits are 100 pages, 50,000 records, 32 MiB normalized JSON and 64 MiB private request/result JSON; an oversized run fails atomically rather than being split.

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
| Begin | `providerSync.begin` | Verify owned connection/provider/status and credential snapshot version, then obtain revision/checkpoint |
| Fetch | None | API calls/validates the connector outside SQL, retaining the committed checkpoint throughout pagination |
| Snapshot | `providerSync.facts` | Repeatable-read bounded relevant facts/rules and canonical fingerprint; POST override supports large scope keys |
| Prepare | None | API computes owned-pair evidence, booking conversion, corrections and tag proposals |
| Commit | `providerSync.commit` | Under user write lock, reject stale inputs and atomically persist authoritative changes/checkpoint |
| Failure / review | `providerSync.failure` / `providerSync.review` | Record failed-attempt metadata separately / read owned unresolved conflicts |

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

The 50,000-record bound counts **accounts + movements + removals across all
pages**, including repeated records on separate pages. UTF-8 serialized normalized
pages also share a cumulative 32 MiB budget; private prepared bodies and factual
results have a 64 MiB budget. Repeated cursors, incomplete pagination, decreasing
page observation time or invalid normalized data fail the run. The service does
not silently split an oversized run or advance its checkpoint after a partial
financial import. Begin/failure attempt metadata is separate from the atomic
financial commit, so "no partial writes" does not mean no attempt was recorded.

Connector retryability and `retryAfter` are reported facts, not an implemented
background scheduler. `banking.importInitial` explicitly imports current Fintoc
accounts and a disclosed 90-day partial movement window through this service. Linking/access-check commands still never
start financial imports, and no scheduled/incremental refresh trigger is shipped.
The first import binds the owned decrypted credential's version to `begin`; a
relink between secret lookup and begin returns `superseded` before provider I/O.
Fintoc begins without that version are rejected. Later relinks/disconnects continue
to invalidate facts/commit/failure through the sync revision. A private review read
is not a delivered review-resolution UI.

### Verification scope

Connector fixtures and API unit tests cover parsing, orchestration, byte/count
bounds and no ambiguous replay without a real provider. Real-PostgreSQL integration
tests cover ownership, correction/removal preservation and atomic commit through
signed RPC. See [test tiers](../../../../docs/technical/development-workflow.md#verification-tiers)
before running them: integration checks open listeners and need disposable test
data. Payload measurements in `scripts/measure-sync-payload.mjs` measure JSON size,
not successful maximum-size database commits, representative RLS load or live
provider readiness.
