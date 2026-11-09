# Sprint B (Stage B) — retrospective

- **Review date:** 2026-11-09.
- **Scope:** Stage B through [`main` at `1cda504`](https://github.com/ig-peralta/LazyFinance/commit/1cda5042a6ecaacca8ce414818c549f85a2f9bd7).
- **Review input:** Git/PR history, Linear workstream outcomes, technical verification records and Ignacio Peralta's closure review.
- **Outcome:** GO to Stage C planning with the [closure's accepted limitations](closure.md#accepted-limitations-and-carryovers).

## Summary

Stage B connected six product tracks to the same financial foundation: backend
management/evidence, the web workspace, Firebase identity, external MCP
authorization, Fintoc connectivity and the first-party text assistant. The
[snapshot](../snapshots/backlog-2026-11-09.md) records all 46 Stage B issues Done.

The review highlighted reusable financial services, clear ownership boundaries,
type safety and more predictable rendering than the earlier private-SSR design.
Grouped deliveries helped keep integrated outcomes coherent. Refund attribution
and the bank-tracking boundary required the most financial discussion or rework.
The next-stage improvements selected in this review are smaller coherent reviews
and explicit live-validation sessions.

## What worked

### Shared financial meaning across interfaces

The core-first sequence allowed the UI, banking adapter, MCP and chat to reuse
financial meanings rather than independently interpreting amounts. Budget and
savings evidence, purchase-attributed recoveries, expected/received income and
account balances remain distinct. [PR #31](https://github.com/ig-peralta/LazyFinance/pull/31)
and subsequent UI/agent deliveries demonstrate this reuse.

### Explicit ownership and maintainable contracts

[PR #26](https://github.com/ig-peralta/LazyFinance/pull/26) placed SQL behind
private persistence, signed contexts, related-owner RLS and scoped transactions.
[PR #27](https://github.com/ig-peralta/LazyFinance/pull/27) refined purpose-shaped
reads, helper ownership and strict types. These boundaries made it clearer where
financial policy, provider calls and atomic stored commands belong. Generated
clients let the applications share contracts without importing one another's
implementation.

### Predictable private-page rendering

The review favored the public-prerender/private-CSR design in
[PR #32](https://github.com/ig-peralta/LazyFinance/pull/32) for rendering
predictability. Browser-owned accepted credentials, destination readiness and
static hosting simplified the private rendering lifecycle while retaining
cancellation and late-result protection. This is a usability/architecture outcome,
not a measured load-performance claim.

### Coherent integrated deliveries

Ignacio described the delivery pattern as grouped coherent outcomes. Financial
contracts, persistence, services and tests could be reviewed together; UI and
provider follow-ups then exercised those capabilities. Linking/access, financial
sync and readonly status stayed separate, avoiding the assumption that successful
authorization made bank data current.

The final action work applied the same principle to explicit proposals and durable
receipts: saving a proposal is not execution, and an uncertain response is not
permission to issue a new write.

## Decisions that required the most attention

| Decision | Difficulty and resulting lesson | Evidence |
| --- | --- | --- |
| **Refund/reimbursement attribution** | A booked credit changes cash in its own period, but a confirmed recovery adjusts spending against the original purchase. UI, budgets, evidence and income must preserve both meanings without double counting. Settle examples before spreading a rule across interfaces | [PR #31](https://github.com/ig-peralta/LazyFinance/pull/31), [API policies](../../../apps/api/README.md) |
| **Bank movement-tracking boundary** | Reported balances are independent of imported history. Moving from a 90-day window to original-first-link-day tracking changed what new users should expect. State the Santiago/day-level cutoff explicitly, preserve existing imported records, and revalidate a changed policy with the provider | [PR #34](https://github.com/ig-peralta/LazyFinance/pull/34), [tracking policy](../../../apps/api/src/banking/fintoc/README.md#tracking-starts-at-first-link) |

Two concrete integration lessons also appear in the recorded fixes:

- Mutable workspace-contract prebundling left development consent using stale
  schemas. Runtime caches need attention even when generated contracts compile;
  the [MCP guide](../../technical/mcp-authorization.md#development-consent-cache-regression--8-november-2026)
  records the diagnosed case and isolated browser verification.
- Proposal saving failed when the running database lacked the action ledger.
  Explicit initialization against the intended baseline matters as much as API/UI
  code. The [assistant record](../../technical/financial-assistant.md#clean-development-baseline-and-proposal-storage-fix--2026-11-09)
  documents the fix, authorized reset and controlled regression.

## Validation lessons

Ignacio reported informal checks across practically all delivered areas: login and
account access, financial screens, bank connection/synchronization, chat/action
cards and an external MCP client. These were useful development smoke checks but
not a rigorous acceptance campaign.

The repository separately records automated suites, real signed-RPC/PostgreSQL
checks, browser/accessibility checks, hosted Fintoc sandbox runs and an actual
local OpenCode read/revocation check. Preserve those evidence levels. In particular:

- Controlled model outputs do not prove independent live-model tool selection or
  financial answer quality.
- A skipped opt-in live-Firebase test remains unverified.
- Sandbox evidence using the earlier window does not verify the final first-link
  cutoff against the provider.
- Existing bounded direct MCP writes are not absent, but broader management
  operations and real external-client write verification remain distinct needs.
- Earlier static-image/browser evidence does not certify every later full-stack
  release image, and functional checks do not measure the latency/load target.

## Improvements for Stage C

### 1. Smaller coherent reviews

Keep each review focused on one demonstrable result. Carry its dependent schema,
contracts, generated output, implementation, tests and relevant documentation
together; do not split atomic behavior merely to reduce a file count. Separate
unrelated outcomes and state the validation boundary clearly.

### 2. Explicit live-validation sessions

Plan dedicated, consented checks for the selected identity, model, banking and MCP
client workflows. Record the build, environment/provider/client version, scenario,
expected/observed result and limitations. Use isolated fixtures and distinguish
developer smoke checks, controlled automation, sandbox results and live-provider
acceptance. Do not use production data or incur provider cost without authorization.

## Handoff

Broader MCP management coverage is the concrete functional follow-up identified
in this review. Define its command/permission boundaries before implementing it;
do not relabel the current bounded direct-write implementation as missing.
The [closure](closure.md) keeps live validation and operational/security gaps
visible without blocking Stage C planning or declaring the product released.
Stage C's exact backlog remains to be selected under its existing milestone.
