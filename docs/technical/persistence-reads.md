# Purpose-shaped persistence reads

Private RPC reads are **use-case facts**, not remote table repositories. The API
should not rebuild persisted relationships or transfer movement history merely
to aggregate it. Keep the public financial behavior independent of SQL details.
See [RPC contracts](rpc-contracts.md), [RLS/atomicity](persistence-security.md) and
[verification tiers](development-workflow.md#verification-tiers).

## Responsibility split

| Persistence | API |
| --- | --- |
| Owned joins, projections, existence flags and nested stored relationships | Financial eligibility/interpretation and public response composition |
| `SUM`/`COUNT` of factual movements for supplied windows and grouping dimensions | Budget/calendar window generation, remaining amounts, percentages and comparisons |
| Relevant bounded facts from one SQL statement or explicit repeatable-read snapshot | Income recurrence/estimates, rule normalization/ranking and provider reconciliation |
| Authoritative writes and fingerprint revalidation under the user write lock | Preparation outside transactions; no ambiguous mutation replay |

Summing exact stored amounts is not moving the entire product calculation into
SQL. Conversely, a large function is not automatically a JOIN problem: new
provider pages and generated recurrence dates are not persisted relations.

## Choose the smallest useful read

- **Stored parent/child data:** return the nested relationship from persistence.
  `objectives.list` selects the effective budget configuration (or an unstarted
  first definition) and uses an ordered correlated JSON aggregation for tags. Parent
  limits apply to objectives, not flattened objective/tag rows; no tags means `[]`.
- **Totals:** send identifiers and explicit time windows; return signed decimal
  sums/counts. `objectives.forPeriod` selects applicable spending definitions;
  `spending` pins their revision IDs, joins revision-specific tags and eligible
  debit movements, and intersects exact activation/end/archive bounds. The API
  chooses monthly/yearly/fixed windows and interprets signed gross amounts plus
  purchase-attributed refund/reimbursement sums as net spending.
  Returned bounds/archival state come from the aggregate statement, so a concurrent
  archive cannot leave a stale cutoff paired with a new total. A retained objective
  with no matching movements returns zero; a foreign/deleted objective is absent.
- **Different projection needs:** keep different reads, sharing the SQL predicate
  builder rather than making every caller receive the largest result.
  `transactions.aggregates` groups only direction/internal/review/receipt states
  (at most 24 groups). `taggedAggregates` additionally joins tag metadata and groups
  by tag; one returned fact set serves both overall totals and the tag breakdown.
- **Subset of a snapshot:** do not fetch the whole snapshot and discard most of it.
  `income.expectedFacts` reads only declarations/dated expectations, `income.receipts`
  only receipt facts, and `income.facts` remains the complete repeatable-read income
  snapshot. Expected income covers the full requested month, not just `asOf`.
- **Growing browse collections:** `transactions.list` uses bounded cursor pages,
  not a complete-history transfer or client-side slicing. Apply filters and the
  `(booked_at, id)` boundary before `limit + 1`, then use the shared
  `pagination/cursor-page.ts` helper. Keep cursor timestamps exact and public/private
  page envelopes aligned through the contracts factory. This browsing contract
  does not replace complete aggregates or write-preparation snapshots. See
  [cursor semantics](rpc-contracts.md#cursor-paginated-browsing).
  History applies owned account, Santiago date, nullable tag/internal state,
  direction and escaped literal-merchant filters in SQL before pagination. The
  normalized selection, not the page size, is bound into each cursor.
- **Existence and keys already joined:** project them in the same query.
  Provider movement facts include `accountExternalId` and `hasReceipt`, rather
  than requiring another account lookup and a separate receipt scan/set. Those
  fields are included in the canonical fingerprint and recomputed on commit.
  The joined internal-disagreement acknowledgement is fingerprinted too, so a
  correction between preparation and commit cannot be overwritten by stale work.
- **Expense recovery:** aggregate allocations separately to one row per purchase
  and per credit before grouping movements, never flattening allocations into a
  movement sum. Purchase facts include refunds, reimbursements and review counts;
  credit facts include applied recoveries, reserved allocations and the remaining
  unclassified count. `adjustmentsAsOf` bounds confirmation/credit observation
  independently from the purchase window/`asOf`, so a later refund can restate an
  earlier period. This is a cutoff over current facts, not historical time travel
  through edited/deleted decisions or provider corrections. Both joins use RLS.
- **Savings allocations:** `savingsFacts` groups selected, non-removed cash movements
  by account type, direction and review state, alongside account history coverage.
  `savingsEvidence` uses the same movement selection and exact bounds in a separate
  page projection. Both reads use repeatable-read snapshots, check the expected
  goal version and intersect configured/archive bounds. The API interprets signed
  sums and pending review states through the shared savings eligibility policy.

Use named typed procedures, not arbitrary SQL/filter expressions over RPC. The
API injects the single `PersistenceClient` directly; no per-domain transport
adapters or repository-shaped compatibility clients are needed.

## Cardinality, correctness and consistency

1. Identify the result's grain before writing a JOIN: one objective, one movement,
   or one aggregate group. A receipt is unique per transaction; an objective/tag
   link is unique per pair; a movement has at most one tag. Preserve those keys.
2. Aggregate independent one-to-many collections separately or use correlated
   subqueries. Joining expectations × receipts can inflate both sums. Never fix
   this with `SUM(DISTINCT amount)`; equal amounts can be distinct real movements.
3. Preserve empty parents with left joins and keep movement predicates in the
   join condition when zero totals must remain visible. Historical archived tags
   remain reportable, and untagged movements still contribute to overall totals.
4. Reuse `movementPeriod` for half-open Santiago windows (`start <= booked < end`)
   and the inclusive instant cutoff (`booked <= asOf`). API window generation
   remains calendar-aware; do not invent UTC-month shortcuts or sum expected and
   received income together.
5. Keep numeric sums as PostgreSQL numeric/decimal strings and API money arithmetic
   exact. Do not coerce amounts to JavaScript numbers or globally change pg parsers.
6. Continue using `RLS_DB` and ordinary ownership policies on every joined table.
   Requested IDs are selection criteria, not authorization or an owner override.
7. Bound input windows, parents, children, aggregate groups and serialized bytes.
   Where a query uses a row cap, fetch one past the contract maximum and reject
   overflow instead of returning an incomplete financial result. A bounded sum
   result does not require transferring or limiting the underlying raw movements.
8. A single SQL statement is consistent within its statement snapshot. Multiple
   reads that form one factual snapshot use `meta: { snapshot: true }`. Separate
   RPCs do not share a snapshot; preserve read/prepare/locked-recheck semantics
   for writes rather than treating multiple calls or HTTP batching as atomic.

Large collection inputs (`providerSync.facts`, `objectives.spending`) use private
POST method override. Empty queries stay GET. Keep transport selection aligned
with the private schemas; public schemas and owner scoping do not change.

## Index computed inputs once

For facts that legitimately remain separate in memory, avoid repeated scans:

- Income recurrence groups dated expectations by source once, then generates
  payments using each source's effective/archive dates.
- Tag matching builds one lookup per immutable rule snapshot, normalizes each
  movement's merchant/description once per lookup, and merges up to four
  preordered global/account buckets. Preserve priority, specificity, creation/ID
  ordering, ambiguity handling and manual/no-tag decisions.
- Prepared writes build rule-ID lookups once and reuse the revalidated facts;
  they do not reload the same rule set or linearly search it for every decision.

Do not move locale-sensitive normalization into PostgreSQL without defining and
testing identical normalization semantics. Do not turn provider reconciliation
into a long SQL transaction containing network calls.

## Change-review checklist

- Does every returned collection/column have a consumer? Trace indirect service
  calls too: a narrow-looking helper can hide a full snapshot or duplicate scan.
- Can a stored relationship or sum be returned directly, instead of an API-side
  ID join or nested movement loop? Are grouping dimensions appropriate to callers?
- Are zero/null/archived/removed/review states, ownership and date boundaries
  unchanged? Can equal-valued movements or multiple selected tags multiply sums?
- Are immutable in-memory indexes built once, without changing decision order?
- Do integration regressions cover actual joined data, zero rows, foreign IDs,
  boundary instants and stale fingerprints? Keep API/helper unit tests focused on
  interpretation and decisions, not constructor wiring or thin RPC delegation.
- Update internal schemas, regenerate routers and remove replaced procedures.
  Run static type/build/format/architecture/drift checks. Run serviceful tests and
  `EXPLAIN (ANALYZE, BUFFERS)` only with authorization and disposable test data;
  measure payloads and plans before adding indexes or claiming latency gains.
