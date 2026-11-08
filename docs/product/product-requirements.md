# LazyFinance — Product Requirements

> **Status:** staged product requirements and acceptance boundaries, not an assertion that every capability is shipped. The [product vision](product-vision.md) describes the why, interoperable direction and Stage A/B/C sequence; the [dated backlog](../planning/snapshots/backlog-2026-11-02.md) contains issue-level completion checks, and the [product Definition of Done](../planning/product-definition-of-done.md) governs an agreed release.

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
Neither those APIs nor their UI prove that imported history is complete; live
bank linking/refresh remains explicitly unavailable pending the banking backend.

## Integration and ecosystem capabilities

### Shared financial results across interfaces

The API owns user-scoped financial calculations and meaning. The dashboard, HTTP API, MCP tools and future first-party agent must use those same capabilities instead of independently recalculating totals or redefining account and movement semantics. For a comparable user and period, balances, spending, budget progress and income interpretations must agree across supported interfaces, including treatment of excluded or unresolved movements, estimates and incomplete history.

### Provider-neutral banking data

Ingest provider accounts, balances and booked movements through a validated, provider-neutral boundary; implement Fintoc as the first planned adapter **after** the core gate. Support additional adapters without rewriting financial rules, subject to validation of each provider's identifiers, dates, signs, account types and balance meanings. Scope provider identifiers to a connection/account, preserve source provenance and a user's own tags and income decisions, and keep repeated imports idempotent. A failed or partial sync must not silently advance a confirmed checkpoint or make an old balance appear current. These behaviors are specified in the [banking connector boundary](../../apps/api/src/banking/README.md); a connector contract and ingestion groundwork do not constitute a working Fintoc integration.

### MCP for agents in the user's own workflow

Expose appropriate **read-only**, user-scoped financial capabilities as MCP tools so a compatible agent can use them alongside its own tools. Tool results must preserve financial meaning, period, owner and data-quality context. Before describing third-party access as available, define and validate client discovery, user authorization, permitted capabilities, token expiry/revocation and two-user isolation with a reference client. The current authenticated MCP endpoint and its read-only tools establish a technical foundation; the final external-client authorization flow is separate work. The current [tool inventory](../technical/rpc-contracts.md#public-surface) includes measured savings and spending evidence.

The [innovation reference](innovation.md#example-a-decision-in-the-users-existing-assistant) describes a possible external-agent workflow, not a requirement for LazyFinance to implement web search, shopping or financial writes. Any future action-preparation workflow requires its own contract, explicit approval, permissions and acceptance checks before selection for delivery. Transaction execution is outside the initial agent scope, not excluded from every future product direction.

## First-party experience and access

- Provide a user-scoped dashboard for the supported financial reads and management workflows. Empty, partial, stale and failed data must remain distinguishable.
- Deliver a first-party text agent that answers questions about the user's finances using the same backend capabilities as the dashboard and MCP. It should distinguish observed facts, declarations and estimates; explain periods and unsupported claims; and handle missing data or tool failures without inventing figures. Text comes before any voice interaction.
- Authenticate users for protected operations and enforce ownership across UI, HTTP, MCP, banking connections and agent calls. An external agent must not supply an arbitrary user ID as financial authority. The temporary mock identity is for local development and is not the final authorization model for other applications.

## Staged validation and scope

- **Stage A — financial-core gate:** use representative CLP demo data to demonstrate coherent account, movement, transfer, budget, savings-target and income scenarios across the available user-scoped interfaces. Record unresolved nonblocking assumptions before starting a provider adapter. The [Stage A closure record](../planning/stage-a/closure.md) documents its completed, deliberately bounded data-model gate; it is not a claim that banking, external-client authorization or the agent are finished.
- **Stage B — parallel product tracks:** refine financial services and web workflows, introduce real-user identity, complete external MCP authorization with a reference client, implement Fintoc as a provider adapter, and deliver the first-party text agent. Each track must meet its issue checks or be explicitly re-scoped at the gate; the [dated backlog](../planning/snapshots/backlog-2026-11-02.md) is an interim view, not a release-completion record.
- **Stage C — candidate expansion:** decide after the Stage B review whether to select voice, advanced analysis, additional providers or other validated financial capabilities. No Stage C issue is assumed selected yet. Shared family finances, organizational or adviser workflows, and approval-based action preparation require new ownership and permissions rules before they could become product requirements for a later release.

The first release scope does not include executing transactions or moving money from an agent. A future financial-action capability must not be inferred from today's read-only MCP tools. See [innovation and interoperability](innovation.md) for opportunities beyond these staged requirements, and the [product vision](product-vision.md) for stage direction.

## Core-model decision questions

These questions shaped the financial-core validation and remain useful when extending the model. The [Stage A closure record](../planning/stage-a/closure.md) and linked implementation decisions document what was resolved at its gate; an open question here is not evidence that its answer was already implemented.

1. How should transfers and credit-card payments be represented so balances and spending remain correct without relying on tag names to identify internal movements?
2. Which balance is meaningful for checking, savings and credit-card accounts, and how should freshness and reconciliation be represented?
3. How are savings-goal contributions and progress measured, separately from spending budgets and tag-linked transactions?
4. Which objective types, recurrence rules, periods and constraints are needed now, and which belong to later increments?
5. Which minimum core workflows make classification and objectives trustworthy, and which insights can wait?
6. Which provider-agnostic fields and identifiers must be stable before implementing an adapter without prematurely encoding Fintoc-specific behavior?

Record decisions and verify representative scenarios before changing schemas or building wider integrations on them.
