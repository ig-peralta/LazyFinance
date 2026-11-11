# Selected-account banking delivery (LAZ-74)

Implementation and local verification on 2026-11-11. This is not live-provider or
production-release approval. The [policy decision](banking-sync-policy.md) retains
the capability/entitlement evidence and operational defaults.

## Delivered outcomes

| Issue | Outcome and retained boundary |
| --- | --- |
| LAZ-89 | Available-data imports, explicit selection/consent, hourly cadence, bounded budgets/recovery and an extraction-ready responsibility split |
| LAZ-86 | Owned bounded discovery, versioned selected sets and server enforcement before fetch/preparation/atomic commit; new accounts remain unselected |
| LAZ-90 | PostgreSQL-backed due work, purpose-restricted claims/admission, one deployment-wide background run and the same existing ingestion engine in API/headless composition |
| LAZ-88 | Authorization → explicit discovery → select/confirm → one initial import, with durable status and no second import click |
| LAZ-87 | Selected/paused/no-access labels, source age separate from import/access, actionable recovery and at most twelve cancellable provider-free observation reads |
| LAZ-97 | Optional setup opens the shared journey with a fixed return link; skip/completion remain independent of financial setup |
| LAZ-85 | Owned set/change/explicit-null clear aliases, validation, retained names during concurrent import/relink and uncertain-save reconciliation |

Deselect/disconnect retains balances, movements, aliases and user decisions.
`account.active` is not selection. Automation defaults disabled; saved enrollment
intent does not pretend that the server or bank is updating data.

## Isolation and safety

The timer/runner only claims and invokes work. `BankingSyncModule` composes the
provider adapter and existing ingestion independently of public HTTP, Firebase,
MCP, assistant and the timer. The headless entry uses signed private RPC, never a
database pool. Provider calls run outside SQL transactions. Future deployment as
a separate service still requires a separate signing/network/credential review.

Independent review findings were fixed and covered by controlled PostgreSQL
regressions: exhausted jobs defer/release their claim fairly; owner transitions
and scheduler claims use row locking; completion/failure is claim/revision-bound
with aligned lease expiry; discovery/synchronization honor persisted connection
and provider-mode backoff. Aliases and tracking metadata remain consistent in
public RPC, assistant reads and MCP account reads.
Final integration also serializes scheduled claim extension with global capacity
observation, preventing an expired committed MVCC tuple from admitting a second
background run while the extension is uncommitted. Its gated PostgreSQL regression
uses controlled clocks, not sleeps or relaxed deadlines.

## Verification evidence

- Root API runner through signed public/private RPC and a **fresh disposable
  PostgreSQL database**: **521 passed, 5 conditional skips**, 81 files. Command:
  `pnpm test:integration --maxWorkers=2` with the disposable owner URL supplied.
  After the planner fix, the same **521 passed / 5 skipped** on the accumulated
  multi-owner database without increasing test deadlines.
- Persistence PostgreSQL boundary: **44 passed**, including quota fairness,
  controlled owner/scheduler locking, replacement-claim late failures and mode
  backoff/RLS isolation. Persistence unit suite: **69 passed**.
- Full UI suite: **460 passed** before two additional continuation regressions;
  the final focused banking/accounts/onboarding run passed **72 tests**.
  With connected-app integration and those regressions, **470 passed** across
  58 UI files after rebuilding shared contracts.
- Workspace build/typecheck, formatting/lint, architecture and RPC drift passed.
  The banking surface is **82 public / 103 private procedures**.
- [Chromium banking smoke](banking-browser-validation.md): **27 checks**, 21 axe
  scans and six heading-order scans, no reported violations or external requests.

An accumulated fixture database exposed a pre-existing aggregate planner/JIT
problem: roughly 3.85 seconds of compilation per monthly summary, without lock
waits. A redundant trusted-owner account join/filter retained RLS and exact
results while reducing the inspected plan from cost 1,290,913 to 1,082 and about
seven milliseconds. This diagnosis is not a maximum-size/load benchmark.
Build retains initial-bundle, assistant-style and
contracts CommonJS warnings; lint retains nonfatal diagnostics.

## Remaining operational gates

No live entitlement, bank freshness, Link billing/pricing, cost acceptance,
production deployment, maximum-size commit/load, real bank browser or live
Firebase extension was verified. Do not enable live automation until those
separate gates and the organization's budget have been reviewed. The mechanism
does not create bank-forced Refresh Intents or promise real-time balances.
