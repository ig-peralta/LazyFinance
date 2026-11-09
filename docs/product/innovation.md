# Innovation and interoperability

This document explains LazyFinance's intended differentiation and the hypotheses
still to validate. The [product vision](product-vision.md) sets direction and stage
gates; [product requirements](product-requirements.md) define agreed behavior.
Innovation direction is not a claim that every integration is shipped or that
the approach is unique in the market.

## From banking displays to reusable financial understanding

People need answers about their finances, not another account list they must
reconcile by hand. A balance alone does not explain spending, expected earnings,
internal transfers, budget limits or whether the underlying data is complete.
An assistant that invents those meanings from raw transactions makes the problem
more conversational without necessarily making the answer trustworthy.

The innovation we aim for is **financial understanding that can be reused across
interfaces and ecosystems**. A user-scoped backend owns consistent calculations,
provenance and uncertainty. LazyFinance's dashboard, its first-party text
agent and authorized external tools can use those same meanings instead of
reimplementing them for each screen, bank or model.

## Two complementary integration directions

### More sources, without redefining the financial core

Provider adapters translate accounts, balances and movements into a common model
with explicit identifiers, date precision, signs, freshness and provenance. User
interpretations remain separate from provider facts, so a correction need not
erase a classification or confirmed receipt. Fintoc is the first implemented bank
adapter; further sources require their own mapping and validation rather than
being assumed interchangeable.

### More destinations, without rebuilding every workflow

MCP can expose permitted financial capabilities to an agent the person already
uses. That agent can combine financial context with **its own** tools and
knowledge. LazyFinance remains responsible for the meaning and ownership of its
results; it does not acquire every capability of the connected agent.

The first-party dashboard and text chat, with voice as a possible extension, remain valuable
destinations themselves. External integrations complement them rather than
replacing the product with a transport protocol.

## Example: a decision in the user's existing assistant

A person could ask: “I need a laptop; which options fit this month's budget?”
With explicit authorization, their assistant could consult LazyFinance for
financial context, use its own web search for products and explain options that
fit the returned budget constraints and data limitations. The person decides
whether to buy.

This is a future interoperability scenario, not a promise that LazyFinance
implements shopping, web search or purchases. Stage B supplies actual OAuth
discovery/grants and a bounded action contract: first-party proposals need explicit
saved-version approval; MCP execution needs separately consented write permissions.
Those controls do not establish safe financial advice, shopping capability or
money movement. Broader MCP management remains a next-stage follow-up.

## Foundation versus unvalidated opportunity

| Present technical foundation | Opportunity still requiring delivery/validation |
| --- | --- |
| Shared financial services, management UI, MCP OAuth/grants, official reference-client checks and a local OpenCode read/revocation check | Broader MCP management coverage, required hosted-client write interoperability and useful multi-tool external workflows |
| Provider-neutral normalization, owned Fintoc linking and manual import/refresh/recovery; controlled and dated sandbox evidence | Current tracking-policy/provider acceptance, live-bank/production conventions and additional adapters |
| Internal user identity, signed private RPC and user-level RLS | Broader shared/family/organization or adviser ownership and permission models |
| Exact financial facts, explicit declarations, grounded text-chat pipeline, reference cards and bounded approved actions | Rigorous live-model quality/value evaluation, then any selected voice or advanced analysis |

The current [architecture](../technical/architecture.md) and
[banking boundary](../../apps/api/src/banking/README.md) describe what exists.
The [Stage B closure](../planning/stage-b/closure.md) distinguishes these delivered
capabilities from their remaining verification and operational limits. Technical
implementation is not proof of product value or a production-ready platform.

## What would demonstrate the value

- Show the same user/period/financial question producing consistent, explainable
  results through supported interfaces, including uncertain or incomplete data.
- Validate an authorized external assistant combining financial context with a
  useful capability of its own, without leaking another user's data or implying
  broader permissions than the user granted.
- Validate another source against the neutral contract without changing existing
  financial meanings or losing user decisions.
- Observe whether people understand the answer and make a useful decision with
  less reconciliation effort. This usability/value claim needs user evidence;
  architecture and protocol adoption alone do not establish it.

Richer analysis, additional sources, new audiences and action-oriented workflows
remain open directions, not a fixed feature roadmap. Select further work at the
stage gates and apply the [quality targets](non-functional-requirements.md),
[user journeys](user-journeys.md) and [release Definition of Done](../planning/product-definition-of-done.md).
