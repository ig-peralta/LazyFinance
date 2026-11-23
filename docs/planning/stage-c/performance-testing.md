# Performance testing — LAZ-108

This is Stage C **V14 measured performance**, not a stage/release gate decision.
The scope and acceptance below were selected when LAZ-108 started; the reproducible
[test suite](../../../tests/performance/README.md) owns the executable method.

## Agreed scope and criteria

- Use current `main` as the application baseline on an identified Git build.
  Execute an isolated synthetic run inside CPU/RAM-limited Docker containers;
  no live banking/model calls or existing user/development database changes.
- Measure authenticated public `accounts.list`, `transactions.recent`,
  `summaries.monthly` and `objectives.progress` on a 12,000-movement owner fixture.
  Require **p95 < 500 ms per route** with **zero request errors** at eight concurrent
  callers, after warm-up; record sample count, data shape and resource caps.
- Separately attempt and measure one ordinary-text import of **50,000 combined
  records** through the real API ingestion and signed private commit. Require a
  complete outcome, 49,999 persisted movements and elapsed time below the 120s
  transport budget. Record observed failure, partial writes and necessary follow-up
  rather than inferring capacity from configured maxima.

The first criterion follows [NFR-06](../../product/non-functional-requirements.md#nfr-06--interactive-performance),
while the capacity run addresses [the Stage B carryover](../stage-b/closure.md#accepted-limitations-and-carryovers).
Build, migrations and fixture creation are excluded from the timed request windows.
This is a local, synthetic single-profile gate, not proof of deployed capacity,
browser progress within one second, model/voice speed or live bank freshness.

## Execution and findings

The local host is an AMD Ryzen 5 PRO 4650U (6 cores/12 threads) with 14 GiB RAM,
Arch Linux 7.3.5. A load-average snapshot near the second run was 1.74/1.66/1.15;
host contention was **not** excluded or continuously sampled. Both runs used
Node 22.23.5, PostgreSQL 18 Alpine, a **2 CPU / 3 GiB** combined runner and a
**1 CPU / 1 GiB** PostgreSQL container with 512 MiB tmpfs and no host ports.
Results are local and gitignored; the paths below name the raw reports.

| UTC run / source build | Four financial reads | 50,000-record synthetic import |
| --- | --- | --- |
| 2026-11-23 00:02 / `b765c783` (clean) | Fixture failed before timing: `tag_decision_origin` CASE needed an enum cast. **No read latency measured.** | **Passed**: complete; 49,999 movements persisted in **91,592 ms**; one account, 49,999 movements, 16,089,031 normalized JSON bytes. |
| 2026-11-23 00:06 / `c2e7f879` (clean) | Reached the read workload, then ran into PostgreSQL **20s statement timeouts** on budget-spending SQL and the Vitest **600s timeout**. No completed read report or credible per-route p95 was saved. | **Failed** after **103,810 ms** with `TRPCClientError`; **0** movements persisted. PostgreSQL also reported a **100s transaction timeout**. The import followed a read suite that timed out, so do not treat this as an independent import-capacity baseline. |

Raw reports: `tests/performance/results/2026-11-23T00-02-01-423Z-b765c783/banking-import.json`
and `tests/performance/results/2026-11-23T00-06-48-207Z-c2e7f879/banking-import.json`.
The latter run lost its read timings because the original harness wrote them only
after all four routes. To expose the failing stage and preserve partial evidence,
the updated harness records per-route correctness/warm-up, request distributions,
private-RPC timing/status, runner CPU/throttling and memory, plus the import RPC
timeline. It stops scheduling once an error or irrecoverable p95 violation occurs
and retains Compose logs. **Rerun pending** on an identified build; neither the
read criterion nor repeatable import capacity has passed on one complete run.

Do not mark LAZ-108 or [the Stage C gate](definition-of-done.md) complete merely
because one isolated import passed; deployed capacity, browser progress, live
providers and model/voice latency are separate work.
