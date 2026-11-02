# LazyFinance — Product Vision and Direction

> **Purpose:** describe the product we aim to build and the direction in which it could grow. The [product requirements](product-requirements.md) specify expected behavior and stage boundaries.

## Product vision

LazyFinance helps people understand their finances and make better decisions without reconciling account balances and transaction lists by hand. The first-party conversational agent (text first, voice later) and visual dashboard are its own ways to experience the product. Its longer-term opportunity is an **interoperable financial capability layer**: a user-scoped financial core that can serve LazyFinance's interfaces and, with appropriate authorization, other compatible agents and applications through MCP.

Personal finance analysis is the starting point, not the limit of the product. We want a trustworthy financial foundation from which to grow into richer analysis, new ways to interact, additional data sources and potentially other financial capabilities. The architecture should make these directions possible without presenting unvalidated use cases as release commitments.

Questions that motivate the initial experience include “How much have I spent this month, and on what?”, “Am I spending more than last month?”, “How am I doing against my grocery budget?”, “Will I have enough money to reach the end of the month?”, “Is this charge unusual or duplicated?”, and “What could I change to reach my savings goal?” The initial agent reads, explains and recommends. Any future ability to prepare a financial action for user approval needs its own requirements, permissions and validation; executing transactions is not part of the initial experience.

## Innovation and interoperability across ecosystems

The innovation we aim for is **reusable financial understanding rather than one more place to display banking data**. Financial rules and user ownership belong in a shared backend, independent of any particular bank, user interface or model. This makes two forms of integration complementary:

1. **More sources:** bank-provider adapters can map accounts, balances and movements to a common financial model, preserving provenance and reconciliation instead of embedding one provider's meanings in the core. Fintoc is the intended first adapter; other financial sources can follow.
2. **More destinations:** LazyFinance's dashboard and own agent can use the same capabilities that authorized external assistants access through MCP. A person should be able to use permitted financial context in an assistant and workflow they already know, while LazyFinance remains responsible for what its figures mean. MCP lets agents combine capabilities; it does not give LazyFinance every capability of a connected agent.

For example, someone could ask an agent they already use: “I need a laptop; what options fit this month's budget?” With the person's authorization, the agent could consult LazyFinance for financial context, use its **own** web search to research products, and recommend options consistent with the user's budget. The person decides whether to buy. Another future workflow could prepare an action for explicit user approval. The point is to let financial understanding travel into useful contexts, not to make every agent or purchase workflow part of LazyFinance itself.

The same foundation could grow from financial status assistance to richer analysis, recommendations and other financial workflows without every interface reimplementing the calculations. It could eventually serve families, organizations or advisers as well as individuals, provided shared ownership and permissions are designed for those contexts. This is an open direction for the product, not a fixed list of future features.

## Foundational approach

Develop the product from a representative financial core outward, using controlled data before depending on bank connectivity:

- Define users, provider connections, accounts, movements, tags, and spending/saving objectives; seed representative Chilean account and transaction history to exercise the model without a live provider.
- Build user-scoped financial logic and API contracts for balances, activity, spending summaries, comparisons, and budget/goal information. Make the meaning of each figure explicit so an interface or agent does not invent financial conclusions.
- Expose those capabilities in a visual dashboard and through MCP tools. Establish trusted identity and appropriate authorization as the product expands beyond development data and first-party interfaces. These interfaces share financial logic rather than each calculating its own figures.

This foundation lets the team test decisions while the model is still adaptable. Provider connectivity follows validation of the core instead of driving its shape from the outset. The [product requirements](product-requirements.md) specify the financial and integration behaviors to check.

### Architecture for growth

- Keep financial concepts and calculations independent of a particular provider, UI, authentication mechanism or agent. The same user-scoped capabilities should serve the dashboard, our agent and authorized MCP clients.
- Define clear contracts where data enters and where capabilities are exposed; preserve provenance, account ownership and reconciliation information so additional providers or financial functions can be introduced without changing the meaning of existing data.
- Prefer simple, tested abstractions around demonstrated needs over speculative implementations. Preserve room for future account types, currencies, workflows and action-oriented features without pretending their requirements are already settled.
- Treat privacy, access boundaries and correctness as foundation-level concerns, including if future features go beyond read-only analysis.

## Development sequence and decision gates

### Stage A — establish and validate the financial core

Use representative demo scenarios to build and revisit the model. The goal is **good enough to validate the data model**, not a polished UI or exhaustive analysis engine. Resolve assumptions about balances, transfers, card payments, income, tags, budgets, savings targets and comparable periods against repeatable examples before importing provider data. Identify any missing minimum core flows exposed by those scenarios.

**Exit gate:** demonstrate coherent, user-scoped financial scenarios and record nonblocking limitations before beginning Fintoc integration.

### Stage B — advance several tracks after core validation

Advance the financial API, web workflows, real-user identity, external MCP authorization, provider connectivity and our own text agent as parallel tracks. Define a neutral bank connector and implement Fintoc as its first adapter. Establish client discovery and user authorization to enable third-party MCP workflows. The first-party agent should draw on the same user-scoped financial capabilities; MCP access for other agents complements it rather than replacing it.

### Stage C — broaden the experience

Voice can extend a useful, reliable text experience. Advanced analysis (such as projections, anomalies, duplicate charges, price changes and goal simulations), further provider adapters and other financial capabilities are possible directions as their data needs and value become clear. MCP-enabled use cases can be considered alongside them. **Stage C work is selected only after Stage B is closed and reviewed**, so these examples do not prescribe its scope.

## Scope boundaries

Personal financial understanding is the starting point. The initial agent reads, explains and recommends; moving money is outside that first experience. A broader financial platform, new audiences and action-oriented capabilities would require their own product decisions and user controls.
