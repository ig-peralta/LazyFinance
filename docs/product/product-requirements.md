# LazyFinance — Product Requirements

> **Status:** requirements reconciled with Stage B's 2026-11-09 development closure, not a production-release claim. The [product vision](product-vision.md) describes direction; the [latest backlog](../planning/snapshots/backlog-2026-11-09.md) records issue outcomes, the [closure](../planning/stage-b/closure.md) records scope/evidence/exceptions, and the [product DoD](../planning/product-definition-of-done.md) governs release.

## Financial understanding

- Show per-account balances and recent movements with account type, source and freshness context. A checking or savings balance is cash; a credit-card liability is not available cash. Recorded or expected income alone does not prove money is available to spend.
- Summarize spending by period and tag, compare comparable periods, and track spending against budgets. Internal transfers and credit-card payments between owned accounts must not inflate spending or earned income. Each transaction belongs to at most one tag group; untagged spending stays in the overall total. Count an eligible movement only once for each budget whose selected tags match it.
- Distinguish user-declared income expectations, explicitly confirmed received income and unclassified credits. A positive credit alone is not proof of earnings. Regularity of payment dates and variability of amounts are independent, and estimates or unknown amounts are labelled. Comparisons use equivalent observed periods; expected-income totals follow calendar payment dates.
- Distinguish a spending budget from a savings goal. Do not display measured savings progress or simulations as fact until a contribution rule is defined and substantiated. Where history is incomplete, show the limitation rather than inventing a complete breakdown.
- Add projections, anomaly/pattern detection, duplicate-charge insight or price-change analysis only with defined data requirements, explainable rules and representative validation cases. These are later candidates, not currently delivered analysis.

The [user journeys](user-journeys.md) give observable examples of the foundational behaviors; the [implemented database model](../technical/database-model.md) describes the current storage relationships and invariants.

The backend's [documented savings rule](../../apps/api/README.md#savings-contribution-policy-laz-35)
measures recorded cash allocations, not bank balances or new wealth; overlapping
goals are not additive. Its measured progress/evidence and purchase-attributed
refund rules are now consumed by the [web-management workflows](../../apps/ui/README.md).
Neither those APIs nor their UI prove that imported history is complete.
The owned Fintoc lifecycle UI supplies hosted bank-authorization flows; this alone
does not establish live-bank readiness. The API supplies bounded
snapshot import/refresh and source-freshness reporting, exposed as separate explicit
web commands and readonly status checks. Bank-forced/scheduled refresh and live-bank
readiness remain separate acceptance work.

## Integration and ecosystem capabilities

### Connected-bank tracking boundary

The financial starting position comes from reported account balances, not a
reconstructed lifetime ledger. Movement tracking starts at each connection's first
successful linking day in Santiago and continues forward. Refresh and same-identity
relink preserve that boundary. There is no automatic pre-link historical backfill
and no fabricated opening transaction when no tracked movements are available.

Provider accounting dates have day-level precision: transactions earlier on the
linking day may be included, and the UI must not promise an exact-second cutoff.
Already imported records and owned decisions remain intact. An optional historical
import needs a separate explicit product policy and bounded eligibility; month or
payroll-based exceptions and a history-selection UI are not delivered here.

### Shared financial results across interfaces

The API owns user-scoped financial calculations and meaning. The dashboard, public API, MCP tools and first-party agent use those same capabilities instead of independently recalculating totals or redefining account and movement semantics. For a comparable user and period, results must agree across supported interfaces, including excluded/unresolved movements, estimates and incomplete history. Persistence alone owns SQL and authoritative stored commands; models and browsers do not supply a financial owner.

### Provider-neutral banking data

Ingest provider accounts, balances and booked movements through a validated, provider-neutral boundary. Stage B delivered Fintoc as the first adapter after the core gate, with owned linking and explicit manual snapshot import/refresh/recovery. Additional adapters must validate their identifiers, dates, signs, account types and balance meanings without rewriting financial rules. Scope identifiers to a connection/account, preserve provenance and owned decisions, and keep imports idempotent. Failed or partial sync cannot advance a confirmed checkpoint or make old balances appear current. The [connector guide](../../apps/api/src/banking/README.md) and [dated Fintoc evidence](../../apps/api/src/banking/fintoc/README.md) distinguish implemented behavior, sandbox coverage and unverified live/production conditions.

### MCP for agents in the user's own workflow

Expose user-scoped financial reads and only explicitly permitted bounded changes as MCP tools. Results must preserve financial meaning, period, owner and data-quality context. Stage B delivered OAuth discovery/registration, owner-bound consent/grants, expiry/revocation and reference-client verification. Existing `finance:read` grants remain read-only; optional write permissions default off and do not grow automatically. The [tool inventory](../technical/rpc-contracts.md#public-surface) includes fourteen financial/supporting reads plus action preview and direct execution. The [compatibility matrix](../technical/mcp-authorization.md#compatibility-and-verification-matrix) distinguishes actual client checks from protocol fixtures and unverified hosted clients.

The [innovation reference](innovation.md#example-a-decision-in-the-users-existing-assistant) describes a possible external-agent workflow, not a requirement for LazyFinance to implement web search, shopping or purchases. Current direct MCP changes use the bounded action contract and separately granted permissions, not the first-party chat approval workflow. Broader management coverage is a Stage C follow-up requiring its own operations, permissions and acceptance cases.

### Bounded changes and approval boundaries

- Support budget/savings-goal creation, tag creation/edit/archive and one movement's tag/no-tag/reset decision. An objective may include explicitly declared dependent new tags; those and the objective commit together.
- In first-party chat, models prepare proposals or read their status. Only explicit approval of the saved ID/version can execute. Conversational agreement is not approval. Edits require fresh approval; stale/expired proposals make no financial change.
- Recheck ownership, current facts, expiry and exact command selection. Commit domain changes and a durable receipt atomically. Repeated approvals return the receipt; an uncertain response requires a status read rather than blind mutation replay. Chat deletion does not undo finance or delete receipts.
- MCP may execute directly only within separately selected OAuth write scopes, with a stable request UUID and preview fingerprint for existing-record changes. The external client owns its confirmation UX. Neither token refresh nor an existing read grant silently authorizes new writes.
- These actions do not move money, connect banks, confirm income, alter bank facts or create automatic tagging rules. Existing direct UI workflows are not automatically available as MCP/assistant commands.

See the [assistant/action guide](../technical/financial-assistant.md) for lifecycle,
limits and privacy, and the [MCP authorization guide](../technical/mcp-authorization.md)
for independent delegation. Implemented safety controls do not prove live-model
quality or hosted-client write interoperability.

## First-party experience and access

- Provide a user-scoped dashboard for the supported financial reads and management workflows. Empty, partial, stale and failed data must remain distinguishable.
- Deliver a first-party text agent using shared backend capabilities, with bounded server-owned history, authenticated streaming/cancellation, financial reference cards and explicit proposal controls. Distinguish observed facts, declarations and estimates; explain periods and unsupported claims; handle missing data/failures without inventing figures. Evaluate the chosen live provider/model separately from controlled fixtures. Text precedes voice.
- Authenticate users for protected operations and enforce ownership across UI, HTTP, MCP, banking connections and agent calls. An external agent must not supply an arbitrary user ID as financial authority. The temporary mock identity is for local development and is not the final authorization model for other applications.

## Staged validation and scope

- **Stage A — financial-core gate:** use representative CLP demo data to demonstrate coherent account, movement, transfer, budget, savings-target and income scenarios across the available user-scoped interfaces. Record unresolved nonblocking assumptions before starting a provider adapter. The [Stage A closure record](../planning/stage-a/closure.md) documents its completed, deliberately bounded data-model gate; it is not a claim that banking, external-client authorization or the agent are finished.
- **Stage B — parallel product tracks:** [closed on 2026-11-09](../planning/stage-b/closure.md) against `main` at `1cda504`, with all 46 issues Done and GO to Stage C planning. The final scope includes private persistence/typed RPC, private CSR/static hosting, additional access methods and bounded actions beyond the original read-only plan. Live-validation and operational exceptions are explicitly accepted for continued development, not release.
- **Stage C — scope selection:** broader MCP management is the functional follow-up identified in the Stage B review. Select exact operations, permission boundaries and acceptance checks alongside any chosen voice, analysis or additional-provider work. The November 9 snapshot has no Stage C issues. Shared/family/organization or adviser workflows still require new ownership rules.

The agreed scope does not include money movement from an agent. Bounded application-record changes are explicitly defined above; additional financial capabilities must not be inferred from their infrastructure. See [innovation and interoperability](innovation.md) for opportunities and the [product vision](product-vision.md) for direction.

## Core-model decision questions

These questions shaped the financial-core validation and remain useful when extending the model. The [Stage A closure record](../planning/stage-a/closure.md) and linked implementation decisions document what was resolved at its gate; an open question here is not evidence that its answer was already implemented.

1. How should transfers and credit-card payments be represented so balances and spending remain correct without relying on tag names to identify internal movements?
2. Which balance is meaningful for checking, savings and credit-card accounts, and how should freshness and reconciliation be represented?
3. How are savings-goal contributions and progress measured, separately from spending budgets and tag-linked transactions?
4. Which objective types, recurrence rules, periods and constraints are needed now, and which belong to later increments?
5. Which minimum core workflows make classification and objectives trustworthy, and which insights can wait?
6. Which provider-agnostic fields and identifiers must be stable before implementing an adapter without prematurely encoding Fintoc-specific behavior?

Record decisions and verify representative scenarios before changing schemas or building wider integrations on them.
