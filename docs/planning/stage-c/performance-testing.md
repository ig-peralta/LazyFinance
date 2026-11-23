# Performance testing — LAZ-108

This is Stage C **V14 measured performance**, not a stage/release gate decision.
The scope and acceptance below were selected when LAZ-108 started; the reproducible
[test suite](../../../tests/performance/README.md) owns the executable method.

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
