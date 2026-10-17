# LazyFinance — Product Requirements Document

> **Status:** product vision and staged requirements.
> **Initial scope:** personal finance understanding, starting with controlled demo data and CLP.

## 1. Product vision

LazyFinance helps people understand their finances and make better decisions without having to reconcile account balances and transaction lists by hand. Its central experience is **our own conversational agent**: users ask questions in text first, and later by voice. A web dashboard provides a visual view of the same financial information. Financial logic lives in the backend and is also available through MCP so other compatible agents and applications can use it.

Personal finance analysis is the starting point, not the limit of the product. We want a trustworthy financial foundation from which we can grow in many directions: richer analysis, new interactions, additional data sources, and potentially other financial capabilities. Architectural choices should make those possibilities feasible without requiring us to define or implement all of them today.

Examples of questions we want to support:

- “How much have I spent this month, and on what?”
- “Am I spending more than last month?”
- “How am I doing against my grocery budget?”
- “Will I have enough money to reach the end of the month?”
- “Is this charge unusual or duplicated?”
- “What could I change to reach my savings goal?”

The initial agent reads, explains, and recommends; transaction execution is **outside its initial scope**, not ruled out forever. Any future action capability would require its own product decisions, authorization, and user controls. Answers must distinguish observed facts from estimates and make clear when data is incomplete.

## 2. Foundational approach

Develop the product from a representative financial core outward, using controlled data before depending on bank connectivity:

- Define users, provider connections, accounts, movements, tags, and spending/saving objectives; seed representative Chilean account and transaction history to exercise the model without a live provider.
- Build user-scoped financial logic and API contracts for balances, activity, spending summaries, comparisons, and budget/goal information. Make the meaning of each figure explicit: overlapping tags do not form exclusive categories, income timing is not available money, and spending-budget progress is not savings-goal progress.
- Expose those capabilities in a visual dashboard and through MCP tools. Use a temporary login mechanism for development, then introduce full authentication. These interfaces share financial logic rather than each calculating its own figures.

This foundation lets us test decisions while the model is still adaptable. Provider connectivity follows validation of the core instead of driving its shape from the outset.

### Architecture for growth

- Keep financial concepts and calculations independent of a particular provider, UI, authentication mechanism, or agent. The same user-scoped capabilities should serve the dashboard, our agent, and authorized MCP clients.
- Define clear contracts where data enters and where capabilities are exposed; preserve provenance, account ownership, and reconciliation information so additional providers or financial functions can be introduced without changing the meaning of existing data.
- Prefer simple, tested abstractions around demonstrated needs over speculative implementations. Preserve room for future account types, currencies, workflows, and action-oriented features without pretending their requirements are already settled.
- Treat privacy, access boundaries, and correctness as foundation-level concerns, including if future features go beyond read-only analysis.

## 3. Development sequence and decision gates

### Stage A — Establish and validate the financial core

Use representative demo scenarios to build and revisit the model, adding the minimum financial behaviors needed to determine whether it works. The goal is **good enough to validate the data model**, not a polished UI or an exhaustive analysis engine. Prioritize correctness and explicit semantics for:

- Accounts and balances, including what a balance means for different account types and when it was last updated.
- Movements, signs, dates, provenance, and relationships among transfers, credit-card payments, income, and spending so summaries do not mistake money moving between accounts for new income or expense.
- Tags and classifications, including overlapping tags, untagged movements, and how they affect totals and budgets.
- Spending budgets versus savings goals: their distinct definitions, periods, progress, and what counts as a contribution to a goal.
- Trustworthy monthly and period comparisons, with clear treatment of incomplete periods and available balances.

Identify and add any **missing core capabilities** revealed by those scenarios before calling the model validated. The exact set should be decided from the review rather than assuming that every future analysis feature belongs in this gate. Exercise representative cases through the domain/API and, where relevant, the dashboard and MCP tools.

**Exit criteria:** the team can demonstrate realistic account, transaction, transfer, budget, and goal scenarios; explain what each amount and relationship represents; produce consistent user-scoped results; and resolve assumptions that would block provider data ingestion, while recording remaining nonblocking questions. The model can still be refined afterward. **Begin Fintoc integration only after this gate.**

### Stage B — Advance several tracks after core validation

These are concurrent workstreams, not a single strict implementation order:

1. **Financial core and API:** refine the model, calculations, contracts, and missing analysis capabilities on the validated foundation.
2. **Web UI:** refine the dashboard and workflows so users can understand data quality, budgets, goals, and explanations, not just see summary cards.
3. **User authentication:** move from temporary development login to full user authentication, with Firebase as the intended identity platform. Keep financial data isolated per user across UI, API, and MCP.
4. **MCP access:** define and implement appropriate authorization for third-party MCP clients. Evaluate OAuth and its client/discovery flows before committing to a scheme; temporary development credentials are not the final integration model.
5. **Provider connectivity:** define a provider-neutral connector contract and normalization rules for accounts, balances, and movements, then implement Fintoc as an adapter. The design must support additional provider adapters without rewriting core financial logic. Validate ingestion and reconciliation against the Stage A model rather than shaping the model solely around Fintoc.
6. **Our conversational agent:** build a text-first experience that uses the same backend financial capabilities, answers with appropriate context, and distinguishes facts from projections. MCP remains available to external clients; it does not replace our agent.

### Stage C — Broaden the experience

Add **voice interaction** to our agent after the text flow is useful and reliable. Expand analysis (for example, projections, anomalies, duplicate charges, price changes, and goal simulations) as their data requirements and behavior are validated. Add further provider adapters and other financial capabilities in response to validated needs; the roadmap is a starting sequence, not a ceiling on what LazyFinance can become.

## 4. Product capabilities and expectations

### Financial understanding

- Show per-account balances and recent movements, with enough context to interpret the account type and data freshness.
- Summarize spending by period and tag, compare comparable periods, and track spending against budgets. Do not imply that overlapping tags add up to a unique total.
- Model income and internal movements accurately in the financial core. Do not present income timing as proof of available funds; use account balances for claims about available money.
- Distinguish spending-budget progress from savings-goal progress. Define measurable savings contributions before presenting goal progress or simulations as facts.
- Add projections and anomaly/pattern detection only with explainable rules, representative scenarios, and clear caveats about uncertainty.

### Interaction and access

- Provide a user-scoped dashboard and, subsequently, a first-party text agent that explains financial results in natural language; extend that agent to voice later.
- Initially expose appropriate read-only financial capabilities through MCP for other agents and applications, with clear tool descriptions and authenticated, user-scoped access.
- Treat authorization, privacy, and data provenance as cross-cutting requirements. A connected provider or agent must not expose another user's data.

### Banking data

- Validate the core with controlled demo data until the Stage A gate is met.
- Support ingestion from a provider-neutral interface with provider-specific adapters; Fintoc is the first planned adapter, not the architecture itself.
- Normalize provider-specific identifiers, balances, dates, transaction types, and sync state without losing information needed to reconcile or explain imported data. Prevent duplicate imports and make refresh/failure states visible.

## 5. Decisions to settle during core validation

These questions guide the model validation and the decisions needed for an extensible foundation:

1. How should transfers and credit-card payments be represented so balances and spending are both correct without relying on tag names to identify internal movements?
2. Which balance is meaningful for checking, savings, and credit-card accounts, and how should freshness and reconciliation be represented?
3. How are saving-goal contributions and progress measured, separately from spending budgets and tag-linked transactions?
4. Which objective types, recurrence rules, periods, and constraints should the model support, and which are needed now?
5. What does the first useful set of missing core flows require (for example, managing classifications or objectives), and which insights can wait until later?
6. Which provider-agnostic fields and identifiers must be stable before implementing an adapter, without prematurely encoding Fintoc-specific behavior?

Document each decision and validate it against seeded scenarios before changing the corresponding schema or building broader integrations on it.

## 6. Scope boundaries and measures of progress

**Not required for the core validation gate:** live/sandbox Fintoc integration, a polished dashboard, Firebase authentication, final MCP authorization, voice interaction, multi-currency/FX, or advanced predictions. These are subsequent work; Stage A still requires correct user scoping and meaningful demo behavior.

**Outside the initial agent scope:** executing transactions or moving money. This is a sequencing decision, not a permanent boundary on the product. Sharing accounts/budgets between people is likewise deferred until the individual experience is established; neither future capability should be constrained by shortcuts in the initial architecture.

We will consider the direction successful when:

- Representative demo scenarios produce coherent balances, spending, comparisons, budgets, and goal interpretations, and the model's remaining limitations are explicit.
- A user can understand those results in the dashboard and ask our own text agent useful questions, with answers grounded in user-scoped financial data.
- Other clients can use the appropriate backend capabilities through securely authorized MCP access.
- Fintoc can be introduced through a provider adapter after core validation, with the same financial logic able to support another provider later.
- Voice extends the proven text experience rather than defining the initial agent experience.
