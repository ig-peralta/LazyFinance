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

Not executed yet. Record the exact source/image, UTC time, CPU and memory caps,
dataset, p50/p95/p99 and errors per route, import result/elapsed time/persisted
rows, machine/load conditions, and raw report location after the isolated suite
runs. Do not mark LAZ-108 or [the Stage C gate](definition-of-done.md) complete
based on a plan or on functional tests alone.
