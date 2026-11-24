# Performance test suite

Run from the repository root with Docker Compose and pnpm 9 installed:

```sh
pnpm test:performance
```

For a repeatability series on the same unchanged checkout:

```sh
PERF_REPETITIONS=3 pnpm test:performance
```

Each repetition creates a fresh Compose project/database and keeps its own report.
Failures do not skip later repetitions; the command is nonzero if any repetition
fails. The series ID, repetition number, source and image IDs identify each result.

This **explicit opt-in** command builds a test image from the current checkout,
starts a separate PostgreSQL 18 container backed by 512 MiB tmpfs, migrates and
provisions its fresh `lazyfinance_perf_test` database, and starts compiled private
persistence plus the API's authenticated test app. The API tests use real signed
private RPC, runtime RLS, and synthetic identities; no existing development
database, live bank/model, external service or host port is involved. The script
copies raw JSON reports and `compose.log` to
`tests/performance/results/<UTC>-<git-sha>/`, refreshes an optional local result
index, and stops only the Compose project it created. Results and the index are
gitignored. A failed assertion returns a nonzero exit status; keep its partial
report and log to diagnose the failure.

The **single committed [dashboard](dashboard.html)** is available at
`tests/performance/dashboard.html` even before any tests have run. Open it directly
in a browser; select `tests/performance/results/` with **Open results folder** to
read every saved run locally. The run selector and archive table give access to all
selected results. Browsers cannot enumerate a local folder automatically, so the
runner also refreshes an optional `results/catalog.js` index for automatic loading
when the dashboard is opened from this repository. Refresh that index independently
of the tests after adding or removing runs:

```sh
node tests/performance/dashboard.mjs
```

The selected run shows route acceptance and partial-sample status, request
distributions, private RPCs, import phases, resources and build provenance. When
using the local index it also links to raw JSON and Compose logs. Missing reports
are unmeasured, never passes. Raw JSON remains authoritative; the HTML is a local
visualization, not another performance measurement. The viewer does not send
report contents anywhere.

The `docker/test/` directory holds the isolated image and Compose configuration;
`tests/performance/run.mjs` owns launch, artifact collection and teardown. The
workloads live under `apps/api/tests/performance/` because they reuse API-owned
typed fixtures; `apps/api/vitest.performance.config.ts` opts into them without
altering `pnpm test` or `pnpm test:integration`. They run **one at a time**;
parallel suites would distort latency. The test image is built before timed
requests. Compilation/migration/fixture creation is not included in p95.

## Workloads and acceptance

| Workload | Synthetic setup and timed operation | Acceptance |
| --- | --- | --- |
| Uniform read baseline | **Eight different authenticated owners**, each with one checking account, one budget and 12,000 same-instant expenses (half tagged, owner-specific amounts). Total: 96,000 movements. | Both profiles independently require 200 successful calls per route, zero errors and pooled route p95 **strictly below 500 ms**. Each owner has one caller and 25 planned calls. |
| Representative financial reads | **Eight different authenticated owners**, each with checking/savings/card accounts, four tags, three budgets and 12,000 deterministic varied movements across six complete Santiago months. Includes salary receipts, refund/reimbursement allocations, untagged spending, balanced internal transfers, review/unknown states and removed movements. Report the latest complete month. Total: 96,000 movements, 9,600 expense adjustments and 4,800 receipts. | Correctness checks verify owner-specific account IDs, recent merchants, monthly totals and exact budget totals on every measured response. Eight concurrent correctness preflights and two warm-ups per owner (16 total) are outside timed intervals. |
| Near-limit provider import | An in-memory synthetic connector supplies one checking account and 49,999 booked movements (50,000 combined records), one complete page with ordinary short text; measure validation, factual snapshot, preparation, transport and commit. Verify persisted rows afterward outside the timed interval. | Complete outcome, exactly 49,999 movements committed atomically, elapsed **under 120 seconds** (transport budget). Record any failure and partial-row count rather than reporting a configured limit as measured success. |

Reads use the application's real public RPC and private signed/RLS paths. The
benchmark client and API app share the runner container's CPU/memory; PostgreSQL
has a separate cap and private bridge network. The generated JSON includes
per-route p50/p95/p99/max, chronological per-request samples, latency buckets,
request failures, throughput and wall time. The new diagnostics also show
preflight/warm-up outcomes, private RPC counts/p95/status by procedure, and
runner CPU throttling, CPU use and memory snapshots for each measured route.
The import report includes a timeline of connector fetch, signed private begin,
facts and commit HTTP calls, the gaps spent in client-side validation, preparation,
serialization and response decoding, request bytes, outcome, persisted rows and
the same resource counters. Both reports retain cgroup limits and the source
commit. The private HTTP spans end at response headers: they include transport,
server and PostgreSQL work, **not** a separate SQL execution-time measurement.
Concurrent per-request/private-RPC durations overlap; do not sum them as wall
time. The runner cgroup includes the benchmark client and private persistence
server but excludes the PostgreSQL container. Its `memory.peak` is since container
start, not a per-route peak. Instrumentation adds some work; compare only equivalent
profiles. This is one local synthetic profile, **not** a UI-first-paint,
voice/model latency, bank-fetch cadence, live-provider test, cross-user capacity
forecast, or production/deployment SLA. The 50,000-record limit is compound with
byte/statement budgets and does not promise all maximum-text inputs will fit.
Reports also record the built image IDs, whether the checkout was clean and
`build.sourceSha256`. The fingerprint hashes sorted Git-visible tracked/untracked
file paths and contents, separated by NUL bytes, excluding `docs/` and Markdown.
It identifies an uncommitted implementation including new migrations/helpers;
the commit alone does not identify a dirty checkout. It is source provenance,
not a claim of a clean release or a substitute for the image IDs.

### Database diagnostics

The isolated PostgreSQL container enables `pg_stat_statements` and planning/I/O
timing. Statistics are reset after warm-up and collected after each timed route
and import. When preflight/warm-up fails, their statistics are retained and labelled
separately, without pretending a timed window ran. They separate PostgreSQL planning/execution time from HTTP spans;
totals across concurrent statements are not wall-clock time. Owner fixture SQL is
excluded by filtering to the restricted runtime login. Bulk fixture tables are
`ANALYZE`d before either profile is timed; the uniform profile remains in the fresh
database when the representative profile runs, with disjoint owner IDs.

A test-only Node preload observes the compiled persistence process's `pg` calls.
`sql-transactions.ndjson` groups statement counts and client-observed SQL duration
inside each scoped transaction, without logging parameters or credentials. This
identifies repeated writes in the import but includes SQL transport and decoding.
After each read profile, diagnostic calls capture the three actual SELECTs using
`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON, TIMING OFF)` inside their existing runtime
RLS transaction. Those replays are **outside** acceptance windows, use one owner,
and have an eight-second plan deadline; a timed-out plan is recorded, not hidden.
These plans are saved in `sql-plans.ndjson` and the read report. No write is replayed
for profiling, and no production query, grant or transaction budget is changed.

The host runner samples **only its two containers** with `docker stats`, saving
`container-resources.ndjson`. Reports/dashboard show per-window PostgreSQL CPU and
observed memory values. Renderer refresh cadence depends on the Docker CLI and may
repeat cached values; sample counts are not independent observations or continuous
peaks. Short windows may have no sample. Instrumentation adds overhead, so compare
equivalent profiles/builds, not the original uninstrumented single-owner runs.

The suite writes a read report **after each completed route**. If preflight or
warm-up fails, it records that stage separately, without inventing 200 timed
requests. Once any timed request fails, the eight in-flight calls finish but no
more are scheduled. The same applies once eleven calls take at least 500 ms:
200-call p95 <500 ms is then mathematically impossible. A partial route is a
**failure**, and its sample percentiles are diagnostics, never a passing p95.
The other routes still run, but a failed route cannot issue unbounded calls or
contaminate the later import. `compose.log` preserves PostgreSQL timeouts when
the database container is torn down.

Defaults are **2 CPU / 3 GiB** for the combined runner (API, persistence and load
client) and **1 CPU / 1 GiB** for PostgreSQL. Override for a new, separately
identified profile, for example:

```sh
PERF_RUNNER_CPUS=2 PERF_RUNNER_MEMORY=4g PERF_POSTGRES_CPUS=1 PERF_POSTGRES_MEMORY=2g pnpm test:performance
```

To repeat with **2 CPUs / 4 GiB per container**, without changing suite defaults:

```sh
PERF_REPETITIONS=3 PERF_RUNNER_CPUS=2 PERF_RUNNER_MEMORY=4g PERF_POSTGRES_CPUS=2 PERF_POSTGRES_MEMORY=4g pnpm test:performance
```

Compose does not publish ports, read the app `.env` files or reuse the ordinary
`docker/local` or `docker/dev` volumes. The 512 MiB database tmpfs disappears
when the isolated container stops. Image building and Docker host contention are
outside the resource caps; record the host and running workloads when comparing
runs. Reports are local by default; summarize a reviewed run with its exact build
and limitations in [Stage C performance testing](../../docs/planning/stage-c/performance-testing.md).
