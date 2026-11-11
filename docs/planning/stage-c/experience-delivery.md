# Integrated experience delivery — 2026-11-11

This records the four requested feature workstreams, not Stage C closure or
production-release approval. The separate validation/release workstream and live
gates remain open. Historical planning and Stage B evidence are unchanged.

## Review stack

| Workstream | Scope | Integration PR |
| --- | --- | --- |
| Connected applications | LAZ-71, LAZ-80, LAZ-83 | [#37](https://github.com/ig-peralta/LazyFinance/pull/37) |
| Selected-account banking | LAZ-74, LAZ-85/86/87/88/89/90/97 | [#38](https://github.com/ig-peralta/LazyFinance/pull/38) |
| Clear customizable workspace | LAZ-75, LAZ-78/81/77/82/79/84 | [#39](https://github.com/ig-peralta/LazyFinance/pull/39) |
| Persistent readable assistant and voice | LAZ-72, LAZ-93/91/92/96/95/94; final LAZ-79 host wiring | [#40](https://github.com/ig-peralta/LazyFinance/pull/40) |

Feature PRs target `feat/stage-c-product-experience`. The final aggregate PR into
`main` is intentionally left open for the user's review. Repository policy allows
squash merging only; feature implementation retains natural commits on its branches.

## Coherent behavior

- One authorize/discover/select/confirm/import journey serves optional setup and
  settings. Explicit selection governs every manual/background financial import;
  new accounts remain unselected and paused/disconnected history stays visible.
- Timer, portable synchronization engine, Fintoc adapter and signed persistence
  commands have separate owners. No provider call runs inside a SQL transaction;
  the worker has no database pool or dependency on public HTTP/auth/MCP/assistant.
- One authenticated assistant host inherits appearance preferences. Navigation and
  minimization preserve text; the safe `?` shortcut restores/focuses that instance,
  not another conversation. Voice ends on navigation/minimization/hidden tabs.
- Separate processing acknowledgement precedes external text/voice. Withdrawal
  during deferred chat creation cancels its continuation. Saved financial approval
  remains a separate exact ID/version command; speech cannot approve a change.
- Theme/text/compact preferences contain no financial/chat/draft data. Tag/no-tag/
  reset and internal/external/unknown remain distinct, with retained history and
  readonly reconciliation after uncertain writes.
- Client names/logos do not verify identity. Connected-app consent/revocation
  exposes actual callback, permissions and status without expanding OAuth authority.

## Executed verification

- Integrated Angular suite: **522 passed**, 63 files, including first-deferred-
  launcher restoration and removed/hidden/inert/closed-dialog opener regressions.
- API suite with signed persistence and disposable PostgreSQL configured:
  **533 passed, 5 conditional skips**, 83 files. Workflow deadlines were not raised.
- Persistence: **69 unit / 46 PostgreSQL boundary tests passed**, including a
  deterministic expired-MVCC claim-extension/global-capacity regression.
- Shared/API/persistence builds, typechecks, formatting/lint, architecture and RPC
  drift passed. Compose interpolation passed with public validation placeholders,
  without starting the stack. Public/private RPC counts remain **82 / 103**.
- [Banking browser evidence](banking-browser-validation.md): 27 journey checks,
  21 axe scans and six heading-order scans, no reported violations.
- [Workspace browser evidence](workspace-delivery.md): 199 checks and 99 axe scans,
  no reported violations after fixing real primary-action contrast.
- [Integrated assistant browser evidence](assistant-browser-validation.md):
  **103 checks, zero failures and 43 clean axe scans** after the deferred-launcher
  focus fix. Responsive preferences, shortcut/focus, streaming/references, exact
  approval, synthetic voice lifetimes and owner isolation were exercised.
- Connected-app Chromium screening covered responsive identity/scopes, malicious
  metadata, focus and uncertain revocation; no external logo requests were used.

Independent reviews found and fixed banking quota fairness, row-claim races,
claim-bound completion, shared backoff, voice startup cancellation, shutdown
initialization and transcription ordering. Integrated browser QA also found that
the replaced first launcher lost focus on minimize; the host now supplies its
visible persistent launcher as fallback while preserving connected-opener return.
An accumulated-fixture summary slowdown
was traced to PostgreSQL JIT compilation and fixed with a trusted-owner join/filter
while retaining RLS and exact results. This is not a maximum-size/load benchmark.

## Remaining gates and operational constraints

Bank automation, chat and voice default disabled. Apply migrations 030/031; old
bank links require explicit selection before importing. Future worker extraction
still needs a separate signing/network/credential review.

Live bank entitlement, Link billing/pricing, actual source freshness, model quality,
physical microphone/browser compatibility, spoken fidelity, remote termination,
measured latency/cost, maximum-size load and deployment were not established.
Voice supports one API replica with dedicated provider project/spend controls;
admission and unresolved hangup recovery are memory-only. A modified browser may
request ungrounded provider audio but gains no financial execution or cross-user
data authority. Written saved answers remain authoritative.

LAZ-94's separately authorized live-session acceptance remains unverified, so
LAZ-94 and its parent LAZ-72 stay In Review rather than claiming full live
acceptance. Other delivered implementation records can close independently;
LAZ-76/98/99/100 and the release gate are not closed by this work.

The final UI build reports **593.37 kB** initial output against a 500 kB warning
budget, **4.89 kB** assistant styles against 4 kB, and contracts CommonJS optimization
warnings. Final lint reports **27 warnings and 10 informational diagnostics**,
without errors. Budgets were not raised.
Automated axe/keyboard screening is not full WCAG,
screen-reader, cross-browser or 200%-zoom certification. See the individual
delivery records and [live voice contract](../../technical/assistant-live-voice.md).
