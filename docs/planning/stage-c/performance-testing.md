# Performance testing — LAZ-108

This is Stage C **V14 measured performance**, not a stage/release gate decision.
The scope and acceptance below were selected when LAZ-108 started; the reproducible
[test suite](../../../tests/performance/README.md) owns the executable method.

**Current measured outcome (2026-11-24):** remediation passes three repetitions
with **2 CPUs / 4 GiB per container**, unchanged eight-owner workloads and unchanged
thresholds. The separate lower-resource default-profile assessment still fails
representative summary/budget latency. See the [final results](#final-requested-profile-acceptance-25b3e684)
and [default-profile limitation](#unchanged-default-profile-assessment).

## Agreed scope and criteria

- Use current `main` as the application baseline on an identified Git build.
  Execute an isolated synthetic run inside CPU/RAM-limited Docker containers;
  no live banking/model calls or existing user/development database changes.
- Measure authenticated public `accounts.list`, `transactions.recent`,
  `summaries.monthly` and `objectives.progress` on two **eight-owner** profiles:
  a uniform baseline and representative six-month history. Each owner has 12,000
  movements and its own authenticated caller (96,000 movements per profile).
  Require **p95 < 500 ms per route** with **zero request errors** at eight concurrent
  callers, after correctness preflight and warm-up. Plan 200 calls per route,
  25 per owner; record pooled and per-owner samples, data shape and resource caps.
- Separately attempt and measure one ordinary-text import of **50,000 combined
  records** through the real API ingestion and signed private commit. Require a
  complete outcome, 49,999 persisted movements and elapsed time below the 120s
  transport budget. Record observed failure, partial writes and necessary follow-up
  rather than inferring capacity from configured maxima.

The first criterion follows [NFR-06](../../product/non-functional-requirements.md#nfr-06--interactive-performance),
while the capacity run addresses [the Stage B carryover](../stage-b/closure.md#accepted-limitations-and-carryovers).
Build, migrations and fixture creation are excluded from the timed request windows.
This is a bounded local synthetic workload, not proof of deployed capacity,
browser progress within one second, model/voice speed or live bank freshness.

### Eight-owner scope refinement

The eight-owner profile supersedes the original single-owner concurrency workload;
the historical measurements below retain their original interpretation. Both new
profiles use eight distinct internal users, mock bearer tokens and account sets.
Every measured response checks owner-specific account IDs or financial results.
The representative profile adds three account types, four tags, three budgets,
income receipts, explicit expense recoveries and varied movement dates/states.
It reports the latest complete Santiago month rather than a moving partial month.
Owner fixture setup and `ANALYZE` are outside measurement; no live provider is used.

The enhanced suite also records PostgreSQL statement planning/execution statistics,
transaction-level client SQL counts/timings and sampled PostgreSQL CPU/memory.
Scoped query plans are captured by diagnostic read replays **after** timed routes,
with the real runtime role/RLS and no write replay. Three repetitions on one
unchanged identified build have completed; see the
[eight-owner results](#eight-owner-repeatability-series-75000316). The older
single-owner results retain their original interpretation.

The first eight-owner pilot (`089d511b`) was interrupted
after finding harness defects: the pg observer recognized `BEGIN` but not Kysely's
`START TRANSACTION`, and Docker's streaming terminal controls prevented resource
JSON parsing. Its partial read data and successful 93,061 ms import are retained,
but it is not a completed acceptance run. The harness now recognizes both SQL
forms, checks observer readiness, strips Docker terminal controls and starts
sampling only after container startup. Preflight and warm-up use eight concurrent
owners (two warm-ups each), rather than spending the test deadline on serial
slow requests. Failed preflight/warm-up statistics remain explicitly labelled.

## Execution and findings

The local host is an AMD Ryzen 5 PRO 4650U (6 cores/12 threads) with 14 GiB RAM,
Arch Linux 7.3.5. A load-average snapshot near the second run was 1.74/1.66/1.15;
host contention was **not** excluded or continuously sampled. All runs used
Node 22.23.5, PostgreSQL 18 Alpine, a **2 CPU / 3 GiB** combined runner and a
**1 CPU / 1 GiB** PostgreSQL container with 512 MiB tmpfs and no host ports.
The measurements, conditions and interpretation needed for review are included
below; this record does not require access to an operator's generated reports.

| UTC run / source build | Four financial reads | 50,000-record synthetic import |
| --- | --- | --- |
| 2026-11-23 00:02 / `b765c783` (clean) | Fixture failed before timing: `tag_decision_origin` CASE needed an enum cast. **No read latency measured.** | **Passed**: complete; 49,999 movements persisted in **91,592 ms**; one account, 49,999 movements, 16,089,031 normalized JSON bytes. |
| 2026-11-23 00:06 / `c2e7f879` (clean) | Reached the read workload, then ran into PostgreSQL **20s statement timeouts** on budget-spending SQL and the Vitest **600s timeout**. No completed read report or credible per-route p95 was saved. | **Failed** after **103,810 ms** with `TRPCClientError`; **0** movements persisted. PostgreSQL also reported a **100s transaction timeout**. The import followed a read suite that timed out, so do not treat this as an independent import-capacity baseline. |
| 2026-11-23 00:28 / `d1ec0f7d` (clean) | **Failed**: `accounts.list` completed 200/200, zero errors, p95 **104 ms**. `transactions.recent` stopped after 70/200 successes (zero errors) because 14 calls took ≥500 ms; its partial-sample p95 was **584 ms**, not a 200-call p95. A harness short-circuit prevented `summaries.monthly` and `objectives.progress` from running. | **Passed**: complete; 49,999 persisted in **94,571 ms**. The signed `providerSync.commit` request took **93,209 ms** of that total and sent **31,077,797 bytes**. Runner cgroup used **33.5 CPU seconds** with **1.3 s** throttling; no OOM kills. The commit HTTP span includes transport, server and SQL, not separately measured SQL time. |
| 2026-11-23 00:33 / `210143a7` (clean) | **Failed**: all four routes diagnosed. `accounts.list` passed; `transactions.recent`, `summaries.monthly` and `objectives.progress` crossed the 500 ms threshold and stopped early without request errors. Details below. | **Passed**: complete; 49,999 persisted in **91,704 ms**. The **90,366 ms** private commit call dominated the import, with a **31,077,797-byte** request body. |

The complete four-route diagnostic (`210143a7`) used runner image
`sha256:b17ffdfc8ca39f5f08e79b28d2b3848af0727e79675df127bd0b7b7ce7d5c502`;
the PostgreSQL image was
`sha256:9ba53c7d41ea093baf5c1ba635ba5434c4f979880527d49bb7d9237d3193085b`.
The second run lost its read timings because the original harness wrote them only
after all four routes. The updated harness preserves per-route preflight/warm-up,
request distributions, signed private-RPC timing/status, runner CPU/throttling and
memory, import phases and Compose logs even when a route fails.

### Four-route diagnostic (`210143a7`)

All preflight checks and 16 warm-up requests per route succeeded. The measured
route window used eight concurrent callers and a 12,000-movement owner fixture.
**Partial** rows stop scheduling once an error occurs or eleven calls exceed 500 ms,
since a passing p95 over 200 calls is then impossible. Their displayed percentiles
describe the attempted calls; they **are not** a completed 200-request p95.

| Public route | Successful / planned; errors | p50 / p95 / p99 ms | Private bottleneck (p95 ms) | Acceptance |
| --- | --- | --- | --- | --- |
| `accounts.list` | 200 / 200; 0 | 75 / **111** / 127 | `accounts.listActive` 66; identity resolution 66 | **Pass** |
| `transactions.recent` | 46 / 200; 0 | 403 / **601** / 602 (partial) | `transactions.recent` 547 | **Fail**: 11 calls ≥500 ms |
| `summaries.monthly` | 18 / 200; 0 | 1,488 / **2,056** / 2,056 (partial) | `transactions.taggedAggregates` 2,008 | **Fail**: 18 calls ≥500 ms |
| `objectives.progress` | 18 / 200; 0 | 812 / **1,326** / 1,326 (partial) | `objectives.spending` 1,244 | **Fail**: 18 calls ≥500 ms |

No PostgreSQL statement timeout occurred during this bounded run; the unbounded
second run's timeouts have **not** been explained away. The private HTTP spans
include server/transport time and end at response headers; they do not isolate
SQL execution or prove the query plan. Runner CPU throttling was **0** during the
three failing route windows, so runner throttling does not explain their observed
latency. PostgreSQL CPU usage was not separately sampled; inspect scoped SQL
plans, indexes and recovery joins before claiming a database root cause.

### Import diagnostic (`210143a7`)

The synthetic one-page connector returned 50,000 combined records (49,999
movements) and 16,089,031 normalized JSON bytes. The successful import's elapsed
time was **91,704 ms** against <120,000 ms, with exactly **49,999** rows persisted:
private `providerSync.begin` **35 ms**, facts **454 ms**, and commit **90,366 ms**
(about **98.5%** of total elapsed). Excluding the facts RPC, about **835 ms** of
client-side gaps fell between the in-memory connector result and the commit
request, including scope/validation, facts response decoding, preparation,
signing and serialization. The runner cgroup used **31.4 CPU seconds** over the
91.7 s wall interval, reported **1.1 s** CPU throttling, a since-container-start
memory peak of **857 MB** and **0** OOM kills. PostgreSQL CPU and detailed commit
SQL timings were not captured; the commit HTTP span cannot distinguish them from
transport and server work. Three of four import attempts completed, while the
second failed atomically with zero movements after a 100s transaction timeout.
The ~90s commit HTTP span is near the configured 100s transaction timeout, but
HTTP and SQL clocks are not interchangeable. This does not establish repeatable
maximum-size capacity or production throughput.

**Outcome:** LAZ-108 now has executed measurements and failure evidence, but the
agreed read criterion **did not pass**. Investigate the three named private reads
under the same owner/volume and profile the commit transaction before making a
capacity claim or revising thresholds. Do not mark LAZ-108 or
[the Stage C gate](definition-of-done.md) complete merely because import attempts
passed; deployed capacity, browser progress, live providers and model/voice
latency are separate work.

## Eight-owner repeatability series (`75000316`)

Executed `PERF_REPETITIONS=3 pnpm test:performance` with series ID
`2026-11-23T02:24:57.404Z`. All three repetitions used a clean checkout of
`75000316ee72f759b2913bbc1c3ba2e9125c9717`, the same runner image
`sha256:2765a05537b91458dfaa055a5031d3b797ebbee5243c4c9f0e95b904cb8233ec`
and the PostgreSQL image recorded above. Each repetition created a fresh database
with the same **2 CPU / 3 GiB** runner and **1 CPU / 1 GiB** PostgreSQL caps.
All profiles and imports completed their bounded test execution; the command
correctly returned **1** because the read acceptance criteria failed.
Repetitions started on **2026-11-23** at **02:24:57**, **02:33:54** and
**02:41:20 UTC**, respectively.

Both profiles have eight distinct authenticated owners and 12,000 movements per
owner. Full 200-call results contain exactly 25 calls from each owner. The uniform
fixture remains when the representative fixture is added, with disjoint owner IDs;
the import ran first in each repetition and its 49,999 movements also remained as
foreign background data. Thus the two profiles are separate workloads, not an
apples-to-apples query-optimization comparison. Host contention was not excluded.

| Profile / public route | Repetition 1 | Repetition 2 | Repetition 3 | Finding |
| --- | --- | --- | --- | --- |
| Uniform / `accounts.list` | 200/200; p95 **84 ms** | 200/200; **84 ms** | 200/200; **92 ms** | Pass in all three; no timed errors |
| Uniform / `transactions.recent` | 200/200; **419 ms** | 200/200; **409 ms** | 200/200; **482 ms** | Pass in all three; no timed errors |
| Uniform / `summaries.monthly` | 18/200; partial p95 **12,058 ms** | 18/200; **11,852 ms** | 18/200; **11,426 ms** | Latency failure in all three; all 18 attempted timed calls succeeded |
| Uniform / `objectives.progress` | Preflight failed | Preflight failed | Preflight failed | Eight concurrent preflight calls hit PostgreSQL statement timeouts; no timed acceptance sample |
| Representative / `accounts.list` | 200/200; **119 ms** | 200/200; **123 ms** | 200/200; **132 ms** | Pass in all three; no timed errors |
| Representative / `transactions.recent` | 200/200; **492 ms** | 173/200; partial **501 ms** | 200/200; **496 ms** | Borderline; repetition 2 stopped after eleven calls ≥500 ms, with no timed request errors |
| Representative / `summaries.monthly` | Preflight failed | Preflight failed | Preflight failed | Eight concurrent preflight calls hit PostgreSQL statement timeouts; no timed acceptance sample |
| Representative / `objectives.progress` | Preflight failed | Preflight failed | Preflight failed | Eight concurrent preflight calls hit PostgreSQL statement timeouts; no timed acceptance sample |

Partial percentiles describe only completed calls and are not 200-call acceptance
results. A preflight failure is not zero-error acceptance: the public error was
`Persistence is unavailable`, and Compose logs identify the **20s statement
timeout** on the named financial query. No fixture-value assertion failed in the
completed diagnostic replays.

| Import repetition | Elapsed | Private commit HTTP | Persisted movements | Outcome |
| --- | --- | --- | --- | --- |
| 1 | **96,019 ms** | **94,656 ms** | **49,999** | Pass |
| 2 | **96,411 ms** | **95,065 ms** | **49,999** | Pass |
| 3 | **94,538 ms** | **93,156 ms** | **49,999** | Pass |

### Test/setup review versus application findings

- **Harness defects fixed before this series:** recognize Kysely's `START
  TRANSACTION` as well as `BEGIN`, assert observer readiness, parse Docker's
  streaming terminal controls, start sampling after startup, and run preflight/
  warm-up with the intended eight concurrent owner callers. Each corrected run
  saved six scoped plans, transaction records and container samples. Resource
  parsing reported **zero errors** in all three runs.
- **Real read-performance findings left unchanged:** single-owner diagnostic
  `EXPLAIN ANALYZE` replays through the real runtime/RLS path returned correct
  fixture totals. `transactions.taggedAggregates` took **695–744 ms** in the
  uniform profile and **6,919–7,278 ms** with representative history;
  `objectives.spending` took **4,993–5,282 ms** and **5,271–5,423 ms** respectively.
  Budget plans scanned the transaction table with large foreign-row rejection
  counts; aggregate/budget plans contained **1,450–2,156 JIT functions**. These are
  diagnostic observations, not an isolated proof that JIT is the sole cause.
  PostgreSQL mean sampled CPU during the uniform monthly timed window was
  **98.9–99.1% of one core**. These results support genuine database workload
  pressure, not a malformed fixture or missing authentication.
- **Real import cost left unchanged:** the observer counted **49,999 individual
  movement INSERTs** in each ordinary commit, matching the implementation's
  sequential write loop. Their client-observed SQL time totalled **82.4–83.8 s**;
  PostgreSQL reported **24.0 s planning** plus **11.2–11.4 s execution** for those
  inserts. Client SQL time also includes transport/decoding and scheduling; it is
  not interchangeable with PostgreSQL execution time. Three successful imports
  under this ordinary-text synthetic shape do not guarantee arbitrary payload or
  production capacity.
- **Sampling limitation:** Docker rendered roughly half-second snapshots here,
  sometimes repeating cached readings, rather than the approximately two-second
  cadence originally described by the producer. The producer wording has been
  corrected for future runs. Reported
  means/maxima are sampled observations, not independent samples or true peaks.

No production API/persistence query, index, financial rule, runtime grant, resource
cap or transaction timeout was changed. Application remediation remains outside
this test/evidence task. There is no Stage C or read-performance pass claim.

All eighteen plan captures completed without replay failures; no global Vitest
timeout or database-space error occurred in this series. The measurements above
are the committed review record. The tracked
[suite guide](../../../tests/performance/README.md) explains reproduction, and the
tracked [dashboard](../../../tests/performance/dashboard.html) can inspect results
produced by a new run; neither is a substitute for the findings recorded here.

## Higher-resource baseline (`07a89ef7`, 2026-11-24)

Before changing application code, three fresh-database repetitions used clean
merged `main`, `07a89ef730a4320baac87cbc90010cf4306cf634`, with **2 CPUs / 4 GiB
for each container**. The suite defaults above were not changed. Series ID:
`2026-11-24T02:01:40.451Z`; starts: **02:01:40**, **02:08:03** and **02:12:52 UTC**.
Runner image:
`sha256:a3cf6cddca530bb1774745b8b8b17fa766092078a67c9fe524d3e6a6bd211deb`;
PostgreSQL used the image recorded in the earlier series. The same host,
eight-owner fixtures, thresholds, bounded stopping rule and foreign background
data apply. These are a separate resource profile, not replacements for the
default-profile historical results.

| Profile / route | Repetition 1 | Repetition 2 | Repetition 3 |
| --- | --- | --- | --- |
| Uniform / accounts | 200/200; p95 **80 ms** | 200/200; **81 ms** | 200/200; **85 ms** |
| Uniform / recent | 200/200; **210 ms** | 200/200; **200 ms** | 200/200; **197 ms** |
| Uniform / monthly | 18/200; partial **6,022 ms** | 18/200; partial **5,877 ms** | 18/200; partial **5,816 ms** |
| Uniform / budgets | Preflight timeout | Preflight timeout | Preflight timeout |
| Representative / accounts | 200/200; **101 ms** | 200/200; **113 ms** | 200/200; **100 ms** |
| Representative / recent | 200/200; **263 ms** | 200/200; **215 ms** | 200/200; **218 ms** |
| Representative / monthly | Preflight timeout | Preflight timeout | Preflight timeout |
| Representative / budgets | Preflight timeout | Preflight timeout | Preflight timeout |
| Import elapsed / persisted | **92,002 ms** / **49,999** | **93,343 ms** / **49,999** | **93,794 ms** / **49,999** |

Timed reads had zero request errors; failed preflights are still failures, not
zero-error acceptance. Monthly partial percentiles are not completed 200-call
p95 results. All three imports passed, but every repetition failed overall read
acceptance. Increasing resources alone did not solve summaries or budgets.

### Remediation decisions and diagnostic evidence

An isolated eight-owner PostgreSQL replay on the dedicated 2-CPU/4-GiB diagnostic
container compared identical SQL/results with query-local JIT on/off:

| Original query | Normal JIT execution | JIT compilation within execution | JIT-off execution |
| --- | --- | --- | --- |
| Tagged summary aggregate | **6,204 ms** | **6,117 ms**, 2,076 functions | **97 ms** |
| Budget spending | **4,840 ms** | **4,785 ms**, 1,486 functions | **61 ms** |
| Recent movements | **18 ms** | None | **18 ms** |

The existing correlated/nested-aggregate shape first reduced summary compilation
to 1,093 functions and execution to **3,727 ms**, still insufficient. Approved
query-local materialized facts then removed repeated recovery eligibility/capacity
work. Owned-account selection, typed budget windows and materialized revision/
legacy tag membership reduced budget planning complexity without changing its
window/revision/archive selection. Normal JIT remains enabled; no production
deadline, cost threshold or session-wide planner setting was relaxed.

The equivalent expense-adjustment SELECT-policy experiment reduced the isolated
materialized summary from approximately **204 ms** to **49 ms**. Both parent
movements still require owned transaction/account visibility; write policies,
grants and forced RLS remain intact. Migration 037 retains that representation.
Final isolated executions were approximately **48 ms summary / 54 ms budget /
0.4 ms recent**, with no JIT generated under normal JIT settings. Recent selection
uses per-owned-account top-ten candidates plus migration 036's matching partial
index; history cursor semantics are unchanged.

These isolated results are **diagnostics, not load acceptance**. In particular,
the diagnostic fixture's observation cutoff predates its later-created allocation
confirmations, so result equality there does not prove applied recovery totals.
Permanent financial regressions and the representative full-load assertions are
required independently.

Import profiling justified replacing 49,999 sequential movement writes with
100-row batches, not splitting the financial commit. Typed updates preserve user
fields; prepared decisions request returned rows only when needed. The original
user lock, fingerprint/lease checks, conflict/event work and checkpoint transaction
remain intact. A first intermediate load run at **02:47:42 UTC** completed the
49,999-movement import in **7,674 ms**, with **500 movement INSERT statements**.
Uniform monthly p95 was **291 ms**, but uniform budget partial p95 **1,802 ms**,
representative monthly **1,768 ms** and representative budgets **2,294 ms** still
failed. That run preceded the SELECT-policy and final budget-tag refinements and
is not the final implementation's acceptance evidence.

### Full-background refinement (`ca12edfd`, 2026-11-24)

The next three runs, series **2026-11-24T03:19:43.811Z**, started at **03:19:43**,
**03:22:34** and **03:23:47 UTC** with 2 CPUs / 4 GiB per container. They tested
the uncommitted implementation before migration 038, identified by source
fingerprint
`ca12edfd08b35cf989dc8adaccfe2955d713c7d36ccfc3fc1be0154ea77df0ee`
and runner image
`sha256:29e5bac5126c496978c065e0a2dbd2f7f1d290536eb8cc3037ec5b20e4f7313e`.
The PostgreSQL image remained unchanged. All uniform routes passed (monthly p95
**281/291/270 ms**, budgets **373/352/385 ms**); accounts and recent passed in
both profiles. Both representative monthly/budget routes still stopped at
18 successful timed calls in every repetition, with zero errors: monthly partial p95
**1,742/1,757/1,680 ms**, budgets **2,100/2,111/2,143 ms**. Imports passed in
**8,524/8,585/8,525 ms**, each with exactly 49,999 movements and 500 INSERTs in one
committed financial transaction. These are failed overall read runs, not final
acceptance.

All 18 plan captures completed and resource parsing had zero errors. Unlike the
smaller diagnostic, representative plans included all 1,200 owned recovery facts,
but still generated **421–425 summary / 509 budget JIT functions**. The summary
plan cost was about **203,000–204,000**, budget **146,000**, despite only
**215–227 ms / 269–292 ms** single-call diagnostic execution. PostgreSQL used
approximately two cores during the failing concurrent windows. This evidence
required further work rather than extrapolating the smaller isolated timings.

A disposable full-background reproduction (49,999 import movements plus both
eight-owner profiles) reproduced **208 ms summary / 274 ms budget** with JIT,
versus **45 / 74 ms** without it. A covering account/key index was insufficient
and was not retained. After approval to test the remaining SELECT policies, a
plain account-key `IN` policy removed compilation but led to slower full scans;
the income-receipt membership rewrite also slowed execution and was not retained.
The transaction policy's **statement-local account-key array** remained indexable
and returned identical financial results in approximately **40 ms summary /
67 ms budget**, with normal JIT enabled and no generated JIT. Migration 038 keeps
only that transaction SELECT representation; receipt/write policies and grants
remain unchanged. Fresh load measurements are still required for acceptance.

### Budget scope refinement (`5bb6d80f`, 2026-11-24)

With migration 038, series **2026-11-24T03:38:17.741Z** started at **03:38:17**,
**03:41:01** and **03:42:08 UTC**, still at 2 CPUs / 4 GiB per container. Source
fingerprint:
`5bb6d80f6d6ca54bd451c2b1e77100b9f64bf83ae1abbf9d2578d25cd1c98501`;
runner image:
`sha256:8f71141e089d22ae17d796874aa644e655e950fc111fe4e9541d5539a3a87c7a`.
All uniform routes and representative accounts/recent/monthly passed in all three
runs, with 200 calls, 25 per owner and zero errors per route. Representative
monthly p95 was **388/398/388 ms**. Only representative budgets failed, stopping
at **40/33/43** successful calls with partial p95 **586/597/515 ms**. Imports passed
in **8,394/8,687/8,444 ms**, each persisting 49,999 movements through 500 INSERTs.
All 18 plans completed, no plan generated JIT, and resource parsing had zero
errors. Single-owner representative budget diagnostic execution was **63–67 ms**;
PostgreSQL used approximately two cores in the concurrent failing budget windows.
These are still failed overall acceptance runs.

The remaining budget plan recalculated text/calendar intersections while scanning
eligible six-month movements separately for each requested window. The shared
budget builder now materializes **validated native timestamp scopes** once,
preserving revision validity, legacy fallback, empty parents and exact archive
bounds. That makes the movement selection account/date-indexable. A further
independent account-owner join inside allocation facts had underestimated the
same owned cohort and encouraged repeated recovery scans. Removing that redundant
join leaves expense-adjustment **both-parent RLS and both transaction joins**
intact. On the disposable full-background fixture, budget execution fell from
approximately **67 ms to 33 ms**, with identical results and normal JIT enabled;
summary remained approximately **37 ms**. This remains diagnostic evidence until
fresh load acceptance completes.

### Functional and static verification of remediation

- Dedicated PostgreSQL persistence suite: **59/59 passed**. New regressions cover
  exact recent ordering across multiple/inactive accounts, removals and foreign
  rows; recovery grain and both-parent isolation; retained capacity beyond the
  observation cutoff; and 201-row imports/updates with late-failure rollback and
  preserved manual tagging. Existing write/upsert, unscoped and pooled-owner RLS
  checks also pass. The test HTTP body limit now matches production, and the
  destructive-migration refusal check no longer depends on which migration is last.
- Root signed-persistence API run with `--maxWorkers=2`: **625 passed, 5 skipped**
  across **94 passing files**. The skipped live Firebase/model cases are not
  validated. A stale assistant fixture now explicitly cancels its first pending
  proposal before preparing the second; production assistant rules are unchanged.
- Persistence unit suite: **75/75 passed**. API unit tests are included in the root
  API run above.
- UI one-shot suite: **673/673 passed** across **75 files** on a standalone rerun.
  The initial concurrent verification run had one existing assistant navigation
  scenario exceed its unchanged five-second test timeout (672 passed); no UI code
  or deadline was changed to obtain the rerun.
- Workspace build, typecheck, RPC drift, architecture, formatting and whitespace
  checks passed. Lint passed with **25 warnings and 10 informational diagnostics**.
  The cached unchanged UI build still reports initial-bundle and two assistant CSS
  budget warnings, plus the contracts CommonJS optimization warning. Backend Vitest
  reports its existing future native-config-loader warning.

The 59-test persistence and 625-pass API suites were rerun successfully after
migration 038 and again after the budget-scope refinement; concurrent/pool-reused
transaction reads and unscoped transaction denial are explicitly checked. Receipt
policies were not changed.

These checks establish different claims from performance acceptance. They do not
verify live Fintoc/Firebase/model behavior, browser timing, deployed load or a
production migration's lock duration. The three new migrations add no RPC contract
or table shape; generated routers remain unchanged. The permanent dashboard is
unchanged and no dashboard tests were added.

## Final requested-profile acceptance (`25b3e684`)

Executed the following on the same host, without other agent-run verification
jobs during measurement; unrelated host contention was not excluded:

```sh
PERF_REPETITIONS=3 PERF_RUNNER_CPUS=2 PERF_RUNNER_MEMORY=4g PERF_POSTGRES_CPUS=2 PERF_POSTGRES_MEMORY=4g pnpm test:performance
```

Series **2026-11-24T03:50:27.396Z** started its fresh-database repetitions at
**03:50:27**, **03:53:11** and **03:54:18 UTC**. All three returned **0** and passed
both read profiles and the near-limit import. Measurements used an uncommitted
working tree on base `07a89ef730a4320baac87cbc90010cf4306cf634`; that commit alone
does not identify the tested source. All six reports share executable-source
fingerprint
`25b3e68456086fcd9cfd100c2ee82d42ccf34bba129568c5e97b27e10ac12dce`,
runner image
`sha256:ab99b941ab84b18f4d656351ac0a2f6b2ffc4ff86afadc26a5f65556e4b3b037`
and PostgreSQL image
`sha256:9ba53c7d41ea093baf5c1ba635ba5434c4f979880527d49bb7d9237d3193085b`.
Node was **22.23.5**, PostgreSQL **18 Alpine**. Runner cgroups report
`cpu.max = 200000 100000` and `memory.max = 4294967296`; Compose also caps
PostgreSQL at 2 CPUs / 4 GiB. Database storage remains 512 MiB tmpfs, with no
published ports or reused development database. The source fingerprint includes
new migrations/helpers and excludes Markdown/evidence edits, as described in the
[suite guide](../../../tests/performance/README.md).

Every cell below is a **complete 200-call p95 in milliseconds**. Each has eight
distinct authenticated owners, exactly 25 calls per owner, eight successful
correctness preflights, 16 successful warm-ups and **zero timed errors**. Both
profiles retain 96,000 movements and the same financial assertions. In total,
**4,800 timed calls** passed; no route stopped early and every recorded private
procedure had 200 measured calls with HTTP 200 only.

| Profile / public route | Repetition 1 | Repetition 2 | Repetition 3 |
| --- | --- | --- | --- |
| Uniform / `accounts.list` | **94** | **86** | **99** |
| Uniform / `transactions.recent` | **99** | **100** | **105** |
| Uniform / `summaries.monthly` | **206** | **207** | **213** |
| Uniform / `objectives.progress` | **199** | **204** | **202** |
| Representative / `accounts.list` | **81** | **76** | **76** |
| Representative / `transactions.recent` | **131** | **102** | **128** |
| Representative / `summaries.monthly` | **368** | **318** | **391** |
| Representative / `objectives.progress` | **314** | **320** | **364** |

All **18** scoped diagnostic plans completed without replay errors or generated
JIT, with normal JIT settings retained. Representative summary execution was
**36.5/37.4/41.2 ms**, budget **31.6/33.1/34.8 ms**, and recent
**0.67/0.68/0.75 ms**. Each representative recovery plan actually included all
**1,200** owned recovery facts; each budget scope CTE ran once for its **three**
valid windows. These isolated plan durations remain separate from concurrent
HTTP acceptance. The response assertions checked exact net/gross spending,
confirmed income and budget totals, plus owned accounts/recent rows, on every
measured request.

| Import | Repetition 1 | Repetition 2 | Repetition 3 |
| --- | --- | --- | --- |
| Complete elapsed | **7,544 ms** | **8,454 ms** | **8,418 ms** |
| Private commit HTTP | **6,247 ms** | **7,122 ms** | **7,078 ms** |
| Persisted movements | **49,999** | **49,999** | **49,999** |
| Movement INSERT statements | **500** | **500** | **500** |
| Client-observed INSERT time | **4,499 ms** | **5,121 ms** | **5,062 ms** |
| PostgreSQL INSERT planning / execution | **732 / 1,822 ms** | **736 / 1,818 ms** | **734 / 1,819 ms** |

The unchanged synthetic page has 50,000 combined records and 16,089,031 normalized
bytes; each commit request is 31,077,797 bytes. The SQL observer confirms one
committed financial transaction containing all 49,999 inserts (499 batches of
100 plus one of 99), not separate commits. Fingerprint/lease checks, user lock,
conflicts/events and checkpoint atomicity are unchanged. Client SQL time includes
transport/decoding; PostgreSQL planning/execution and private HTTP spans are not
interchangeable clocks. The higher-resource clean baseline's imports took
**92,002–93,794 ms**; this is a measured improvement on that same ordinary-text
workload, not arbitrary maximum-text capacity.

Container parsing had **zero errors**, with **230/236/244** total resource
snapshots. No runner OOM kills occurred. The highest reported runner peak across
read windows was **1,068,568,576 bytes** (since container start), while the largest
sampled PostgreSQL memory value was approximately **541 MB**. Representative
summary/budget windows used approximately **192–201% PostgreSQL CPU** (roughly two
cores). Samples can repeat and are not continuous peaks; CPU caps are not reserved
host capacity. There is no production/deployment, browser, live-bank or model/voice
latency claim and no automatic Stage C/release decision.

## Unchanged default-profile assessment

One additional fresh-database run started at **03:55:31 UTC**, series
**2026-11-24T03:55:31.218Z**, after removing all four resource overrides. It used
the same executable-source fingerprint, runner image
`sha256:a2432bbd8f03dba50634c8233e767c79825e648248c0d18cc52d989f106fef70`
and the same PostgreSQL image. Actual runner limits were the unchanged defaults,
**2 CPUs / 3 GiB** (`memory.max = 3221225472`); PostgreSQL remained
**1 CPU / 1 GiB**. This assessment returned **1**, not a pass or a repeatability
series.

| Profile / route | Successful / planned; errors | p95 ms | Outcome |
| --- | --- | --- | --- |
| Uniform / accounts | 200/200; 0 | **100** | Pass |
| Uniform / recent | 200/200; 0 | **113** | Pass |
| Uniform / monthly | 200/200; 0 | **408** | Pass |
| Uniform / budgets | 200/200; 0 | **411** | Pass |
| Representative / accounts | 200/200; 0 | **88** | Pass |
| Representative / recent | 200/200; 0 | **130** | Pass |
| Representative / monthly | 23/200; 0 | **697, partial** | Fail |
| Representative / budgets | 25/200; 0 | **696, partial** | Fail |

Preflight/warm-up succeeded, all six plans completed, no JIT was generated, and
resource parsing had zero errors. PostgreSQL sampled approximately **99% of one
core** during the failing representative windows, with no runner throttling in
those windows. The import still passed in **8,533 ms**, private commit **7,169 ms**,
with exactly **49,999** movements and **500** INSERT statements in one financial
transaction. The partial read percentiles are not 200-call acceptance p95s.

**Outcome boundary:** the requested 2-CPU/4-GiB-per-container profile passes all
agreed checks repeatedly; the lower-resource defaults do not pass representative
eight-owner summary/budget latency. Defaults and thresholds were not silently
changed. Capacity under that smaller profile remains a separately identified
limitation, not a claim that all resource profiles or deployed workloads pass.
