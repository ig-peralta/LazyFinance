# Fintoc first snapshot import (LAZ-51)

`banking.importInitial({ id: connectionId })` is an authenticated, explicit API
command. It imports current account snapshots and **the last 90 Santiago calendar
days, including today**, not unrestricted history or a new bank refresh.
Authorization completion and `checkConnection` never import implicitly.
The UI import/refresh action and refresh/recovery policy remain LAZ-48/LAZ-62 work.
No payment or money-moving endpoint is used.

## Directory ownership

| Directory | Responsibility |
| --- | --- |
| `client/` | HTTP transport, pagination and raw Fintoc response schemas |
| `credentials/` | Owner-bound Link Token encryption/decryption |
| `import/` | Owned initial-import orchestration and history-window policy |
| `snapshot/` | Operation-owned connector and neutral account/movement mapping |

Unit tests stay beside their implementation. Shared provider fixtures and
public/private RPC integration suites remain under `apps/api/tests/`.

## Ownership and transport

`FintocImportService` reads the owned private credential projection, verifies the
configured mode and active/local connection, then decrypts server-side. It creates
one `FintocSnapshotConnector` per operation and passes the captured credential
version to `BankingIngestionService`. Private `providerSync.begin` checks that
version under the user write lock **before** attempt metadata or provider I/O.
Relink in the secret-read/begin gap returns `superseded`; later lifecycle changes
invalidate the sync revision. Foreign IDs never reach Fintoc.

The adapter verifies Link identity/mode/holder and access, paginates accounts, then
each supported account's movements. Every normalized page makes at most one
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
| `pending=true` / `processing` | Not imported as a booked transaction; counted separately |
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

This is not a webhook consumer, scheduler or incremental-recovery implementation.
It does not request Fintoc refresh intents, prove complete bank history, automatically
pair transfers, establish card debt, reactivate tombstones or resolve provider
corrections that return an already-booked movement to a temporary pending/processing
state. Those refresh-state transitions need the later recovery contract, not an
inferred deletion in this first-import adapter.

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

### Sandbox evidence — 8 November 2026

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

Provider references reviewed 8 November 2026:
[accounts](https://docs.fintoc.com/api/movements-api/accounts/accounts-object.md),
[movements](https://docs.fintoc.com/api/movements-api/movements/movements-object.md),
[pagination](https://docs.fintoc.com/api/fintoc-api/pagination.md),
[version pinning](https://docs.fintoc.com/guides/home/upgrade-api-version.md).
