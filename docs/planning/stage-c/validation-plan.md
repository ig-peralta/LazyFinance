# Stage C — validation plan

**Status:** planned checks, not execution evidence. The
[scope record](planning.md) traces all feedback; LAZ-98 owns controlled experience
verification, LAZ-100 owns separately authorized external integration evidence and
LAZ-99 owns the actual gate record. The [stage DoD](definition-of-done.md) remains
unchecked. The [November 11 scope addition](planning.md#required-scope-additions--2026-11-11)
also requires deployment, performance testing, a mock banking provider and a
substantially richer seed; all four block LAZ-99.

## Evidence levels and safe setup

- Use unit/in-memory UI tests for deterministic state, formatting, classification,
  scroll/focus, microphone lifecycle and failure decisions.
- Use real signed public/private RPC and an explicitly disposable PostgreSQL
  `_test` database for selection/version/alias integrity, background authority,
  RLS, atomic imports and concurrent work. A development/user database is not a
  fixture; do not reset it to obtain evidence.
- Use a recorded browser/build with synthetic data for complete responsive and
  keyboard/accessibility journeys. Automated scans supplement manual interaction;
  they are not an exhaustive audit of the app or provider iframe.
- Authorize provider/model/client sessions separately, including cost and data
  disclosure. Record sandbox versus live and controlled fault injection. A scripted
  model, mocked audio session or former-window bank run does not prove current
  live behavior. Do not open a public tunnel by implication.

Select commands from the [verification tiers](../../technical/development-workflow.md#verification-tiers).
Integration/browser checks may start listeners. This documentation task does not
run them or contact live banking/model services.

## Required acceptance scenarios

| Scenario | Check and expected result | Issues / evidence |
| --- | --- | --- |
| V01 — Clear routine screens | Scan dashboard, financial lists, settings and assistant entry. The next action is clear; secondary detail is expandable; currency, period, account type, freshness and material failures remain visible | LAZ-78; before/after review and browser checks |
| V02 — Optional guided banking | New/returning users can skip, resume or complete onboarding. Authorize, discover/select accounts and explicitly confirm first sync/automatic enrollment in one flow; cancel/error returns safely without duplicate links/imports | LAZ-97, LAZ-88, LAZ-86; UI plus real RPC, separate sandbox session |
| V03 — Selected automatic updates | With the browser closed, the supported background trigger updates only selected owned accounts. Replayed/concurrent triggers coalesce; new accounts remain unselected; deselection, relink and disconnect invalidate late work | LAZ-89, LAZ-86, LAZ-90; worker/RPC/PostgreSQL and provider evidence |
| V04 — Truthful recovery | Crash/interruption, retryAfter, partial snapshot, expired/revoked access, stale/unknown source time and conflicts retain last-good facts. Status reads do not trigger provider work; manual recovery reconciles uncertain outcomes first | LAZ-90, LAZ-87; controlled fault injection and browser checks |
| V05 — Personal account names | Set/change/clear an alias, reload and synchronize/relink. The alias survives; source IDs, balances and ownership do not change; foreign account writes fail | LAZ-85; RPC/PostgreSQL and UI |
| V06 — Tags and classification | Manage catalog and correct a movement from history/detail. Tag/no-tag/reset is distinct from internal/external/unknown; saved changes retain ledger context and reconcile spending/budget/savings reads without changing bank facts | LAZ-81, LAZ-77; controlled UI and real RPC |
| V07 — Persistent readable chat | Open, type, navigate, minimize and reopen one accepted conversation. Stream a long answer: its beginning remains readable and deliberate scrolling is respected. Expand collapsed references without losing position; approval controls remain distinct | LAZ-93, LAZ-91, LAZ-92; streaming UI/browser fixtures |
| V08 — Product identity and privacy | Enabled/disabled/demo/error chat uses concise product-level language, not provider/model badges or vendor errors. Separate external-processing disclosure remains accessible before transmission; secrets never appear | LAZ-96; configuration and UI checks |
| V09 — Preferences and navigation | Change text size/theme, compact the sidebar and use the actual documented shortcut. Verify readable contrast, icon labels, focus restoration and mobile menu; reload persists only non-sensitive preferences | LAZ-82, LAZ-84, LAZ-79; keyboard/browser and storage inspection |
| V10 — Recognizable delegated access | Inspect consent and connected grants with valid/missing/rejected logos. Identity/callback, capabilities, expiry and revoke remain legible; a logo confers no trust. Deny/revoke and verify subsequent access fails | LAZ-80, LAZ-83; malicious metadata fixtures, RPC and named-client session |
| V11 — Live voice | Explicitly allow/start/mute/end microphone; speak, interrupt and inspect transcript/evidence; reject permission, switch device, fail network and return to text. Logout/owner replacement stops capture and ignores late events | LAZ-95, LAZ-94; controlled audio and separately authorized live browser matrix |
| V12 — Financial authority | Across text/voice/navigation, an answer or spoken agreement cannot execute a proposal. Only exact saved-version approval can change finance; stale/expired proposals reject and ambiguous results reconcile. Existing MCP writes retain separate scopes/request IDs/fingerprints | LAZ-98, LAZ-100; shared-action regressions, real RPC and client checks |
| V13 — Working deployment | Complete deployment and verify the agreed core workflows on an identified build; record access, operating context and limitations | LAZ-106; actual deployment and verification evidence |
| V14 — Measured performance | Execute the agreed performance tests; record measured results, findings, limitations and necessary follow-up against the criteria selected during issue work | LAZ-108; executed performance-test evidence |
| V15 — Mock banking journeys | Exercise representative connection, account-selection, synchronization and recovery journeys without real bank access; synthetic behavior retains ownership and financial meaning | LAZ-107; documented mock-provider scenarios and results |
| V16 — Rich synthetic history | Demonstrate varied, coherent financial scenarios across the agreed workflows using the substantially improved, repeatable synthetic seed | LAZ-105; scenario coverage and demonstration results |

V13 and V14 specify required outcomes, **not how deployment or performance testing
will be done**. Choose deployment scope/approach and performance scope/approach/
acceptance criteria when LAZ-106 and LAZ-108 start. No platform, topology, tool,
workload or test environment is selected here. The existing evidence tiers above
cover journey checks; they do not choose a performance-test method. Mock design
and seed generation/volume/loading details likewise remain open until issue work.
None of these four required outcomes can be satisfied by a plan, skipped check or
carryover-risk note. Mock evidence does not replace live-bank acceptance or promote
the optional banking-action simulation.

Run responsive checks at the established 360 px mobile and 1280 px desktop target,
with relevant narrow/short intermediate layouts, largest supported text size and
browser zoom. Check visible focus, full keyboard paths, reduced motion and
accessible disclosure/microphone labels. Record the actual tested matrix rather
than claiming every device is supported.

Voice response/stop targets, session limits and the supported transport/browser
matrix must be set in LAZ-95 before evaluating LAZ-94. The existing financial-read
p95 target is not a voice inference or bank-refresh SLA. Provider-supported cadence
and cost/rate constraints must likewise be recorded in LAZ-89 before evaluating
automatic synchronization.

## Optional checks — only if taken up

| Candidate | Required evidence for its own completion |
| --- | --- |
| LAZ-101 — Quotes | A permitted, bounded source returns dated currency/price and explicit missing costs; unsupported/changed prices degrade honestly; no financial history reaches a marketplace and no purchase/payment occurs |
| LAZ-103 — Banking-action demo | Exact synthetic accounts/amounts and clear simulation labels; no real bank write credential or real-user balance mutation; duplicate/failure/cancel cases remain isolated and production-disabled |
| LAZ-102 — Alerts | Defined critical/eligibility policy, deduplication and meaningful links; intentional no-tag and incomplete savings evidence are handled correctly; acknowledge/resolve and foreign-owner cases pass without financial writes |
| LAZ-104 — WhatsApp | Official access/terms feasibility and consented test channel; explicit authenticated binding/unlink, webhook/replay checks, scoped results and privacy/retention rules; a phone number alone cannot authorize reads or writes |

Record delivered, deferred or promoted for every optional candidate. Promotion
changes the gate explicitly; absence of an optional prototype is not a failed
required scenario.

## Carryovers and evidence record

LAZ-100 must distinguish current evidence for live Spanish model/voice quality,
two-user Firebase behavior, first-link-day bank tracking and named external-client
reads/writes/refresh/revocation from controlled fixtures and earlier delivery runs.
Unavailable credentials, plan/API restrictions and skipped cases remain open or
receive an explicit gate disposition; they do not become passed checks.

For each executed check record:

- Date/time and timezone, responsible participant and exact Git/build baseline.
- Scenario, expected result and observed result, including failures/retries.
- Environment, browser/device/client/provider versions and relevant configuration
  identifiers, without keys, tokens, personal financial records or raw audio.
- Synthetic/sandbox/live classification, authorization for cost/data use and
  evidence location.
- Result: passed, failed, skipped or blocked; defect links and remaining limits.

At the gate, LAZ-99 requires the four additions' delivery evidence, including the
actual deployment and measured performance results. It also records remaining
dependency-security, capacity, operational, rate/cost and retention/deletion
limitations; functional tests and risk dispositions do not substitute for the
required deployment/performance work. Stage completion and the [product release review](../product-definition-of-done.md)
are separate decisions; do not pre-fill a closure or retrospective as successful.
