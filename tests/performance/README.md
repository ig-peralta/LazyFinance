# Performance test suite

Run from the repository root with Docker Compose and pnpm 9 installed:

```sh
pnpm test:performance
```

This **explicit opt-in** command builds a test image from the current checkout,
starts a separate PostgreSQL 18 container backed by 512 MiB tmpfs, migrates and
provisions its fresh `lazyfinance_perf_test` database, and starts compiled private
persistence plus the API's authenticated test app. The API tests use real signed
private RPC, runtime RLS, and synthetic identities; no existing development
database, live bank/model, external service or host port is involved. The script
copies raw JSON reports to `tests/performance/results/<UTC>-<git-sha>/` and stops
only the Compose project it created. Results are gitignored. A failed assertion
returns a nonzero exit status; keep its report to diagnose the failure.

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
| Authenticated financial reads | One owned checking account, one monthly budget, 12,000 CLP 100.00 expenses (half tagged) in the current Santiago month and a separate foreign owner. After 16 warm-up calls, run 200 calls per route with eight concurrent callers, one route at a time: `accounts.list`, `transactions.recent`, `summaries.monthly`, `objectives.progress`. | Every route returns 200 successful results, zero errors and p95 **strictly below 500 ms**. |
| Near-limit provider import | An in-memory synthetic connector supplies one checking account and 49,999 booked movements (50,000 combined records), one complete page with ordinary short text; measure validation, factual snapshot, preparation, transport and commit. Verify persisted rows afterward outside the timed interval. | Complete outcome, exactly 49,999 movements committed atomically, elapsed **under 120 seconds** (transport budget). Record any failure and partial-row count rather than reporting a configured limit as measured success. |

Reads use the application's real public RPC and private signed/RLS paths. The
benchmark client and API app share the runner container's CPU/memory; PostgreSQL
has a separate cap and private bridge network. The generated JSON includes
per-route p50/p95/p99/max, sample counts, errors, throughput and wall time, plus
import duration/status, normalized byte size, persisted rows, cgroup limits and
the source commit. This is one local synthetic profile, **not** a UI-first-paint,
voice/model latency, bank-fetch cadence, live-provider test, cross-user capacity
forecast, or production/deployment SLA. The 50,000-record limit is compound with
byte/statement budgets and does not promise all maximum-text inputs will fit.
Reports also record the built image IDs and whether the checkout was clean; if it
was dirty, the commit alone does not identify the tested source.

Defaults are **2 CPU / 3 GiB** for the combined runner (API, persistence and load
client) and **1 CPU / 1 GiB** for PostgreSQL. Override for a new, separately
identified profile, for example:

```sh
PERF_RUNNER_CPUS=2 PERF_RUNNER_MEMORY=4g PERF_POSTGRES_CPUS=1 PERF_POSTGRES_MEMORY=2g pnpm test:performance
```

Compose does not publish ports, read the app `.env` files or reuse the ordinary
`docker/local` or `docker/dev` volumes. The 512 MiB database tmpfs disappears
when the isolated container stops. Image building and Docker host contention are
outside the resource caps; record the host and running workloads when comparing
runs. Reports are local by default; summarize a reviewed run with its exact build
and limitations in [Stage C performance testing](../../docs/planning/stage-c/performance-testing.md).
