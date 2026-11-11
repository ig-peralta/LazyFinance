# LazyFinance — Product Vision and Direction

> **Purpose:** describe the product we aim to build and the direction in which it could grow. The [product requirements](product-requirements.md) specify expected behavior and stage boundaries; [innovation and interoperability](innovation.md) explains the differentiation and hypotheses to validate.

## Product vision

LazyFinance helps people understand their finances and make better decisions without reconciling account balances and transaction lists by hand. The first-party conversational agent (text and opt-in voice, with separate live-validation gates) and visual dashboard are its own ways to experience the product. Its longer-term opportunity is an **interoperable financial capability layer**: a user-scoped financial core that can serve LazyFinance's interfaces and, with appropriate authorization, other compatible agents and applications through MCP.

Personal finance analysis is the starting point, not the limit of the product. We want a trustworthy financial foundation from which to grow into richer analysis, new ways to interact, additional data sources and potentially other financial capabilities. The architecture should make these directions possible without presenting unvalidated use cases as release commitments.

Questions that motivate the experience include “How much have I spent this month, and on what?”, “Am I spending more than last month?”, “How am I doing against my grocery budget?”, “Will I have enough money to reach the end of the month?”, “Is this charge unusual or duplicated?”, and “What could I change to reach my savings goal?” Some require later analysis, not just existing reads. The delivered text-agent pipeline reads, explains and prepares bounded proposals for explicit approval; it cannot approve or execute them itself. MCP has separately consented bounded writes. Moving money is outside this scope, and live-model answer quality remains a separate validation gate.

The separate [innovation reference](innovation.md) explains the reusable financial
capability layer, complementary source/destination integrations, example workflows
and evidence needed to validate their value. This vision keeps the product
direction and stage decisions separate from that innovation argument.

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

Stage B delivered the financial API, web workflows, identity boundary, external MCP authorization, provider connectivity and the first-party text-agent pipeline. Fintoc is the first adapter behind a neutral banking boundary. Client discovery and user grants enable external MCP access to the same financial capabilities; that access complements LazyFinance's own interfaces rather than replacing them.

**Gate:** [Stage B closed on 2026-11-09](../planning/stage-b/closure.md), with GO to Stage C planning against `main` at `1cda504`. The gate explicitly accepts live-validation and operational limitations for continued development, not public release. Bounded chat-approved actions and independently scoped MCP execution extend the original read-only plan; broader MCP management remains follow-up work.

While Stage B was being built, the [platform direction evolved](../planning/stage-b/platform-evolution.md)
to make persistence, contracts, ownership and session boundaries explicit. That
record explains the engineering changes supporting these product intentions;
it does not replace the stage's workstreams or certify their completion. The
[stage planning guide](../planning/stage-b/README.md) maps the recorded workstreams
to their gate criteria.

### Stage C — broaden the experience

The [scope selected on 2026-11-09](../planning/stage-c/planning.md) focuses on a
clearer everyday experience: easier tagging/classification, optional guided bank
setup with explicit account selection, editable aliases and automatic updates,
recognizable connected applications, accessible workspace preferences, and a
persistent readable assistant with **live voice**. These are planned outcomes,
not claims about the current runtime. The
[planning snapshot](../planning/snapshots/backlog-2026-11-10-stage-c-planning.md)
records 29 required and 5 Optional issue records; the November 20 target remains
tentative. Owners, estimates and individual deadlines were unset at initial
publication; Linear owns current assignments and dates.

The [November 11 addition](../planning/stage-c/planning.md#required-scope-additions--2026-11-11)
also makes **deployment, performance testing, a mock banking provider and
substantial seed improvement required**, bringing selected Stage C scope to
33 required and 5 Optional records. These are general directions, not designs:
deployment and performance-testing approaches are chosen when the respective
issues start. The mock provider and richer synthetic history support development,
demonstrations and validation without real bank access.

External price comparison is optional but highly desirable. A synthetic
banking-action demo, alerts and WhatsApp are also optional; none silently expands
the required gate. Broader MCP management remains the Stage B follow-up, but its
additional commands/permissions are **not selected in this brief**. Advanced
analysis, further real banking integrations, historical backfill and shared
ownership also remain future directions rather than automatic commitments.

## Scope boundaries

Personal financial understanding is the starting point. Current actions change bounded application records, not money or bank facts. First-party models have no execution authority; external MCP changes require separately granted permissions. Additional operations and broader ownership models require explicit product decisions, user controls and validation.
