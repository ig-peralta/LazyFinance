# Stage B — parallel product tracks

Stage B advances the product after the financial-core gate. Its purpose is to
connect usable experiences and real-user access to the same trustworthy financial
capabilities, not to redefine those capabilities separately for every interface.
See the [product direction](../../product/product-vision.md#stage-b--advance-several-tracks-after-core-validation).

## Workstreams from Linear

The [checked-in backlog snapshot](../snapshots/backlog-2026-11-02.md#sprint-b-stage-b--parallel-product-tracks-in-progress)
records six parent workstreams and 40 child issues for Stage B. The table below
organizes that scope; it does not refresh statuses or declare a parent complete
because a supporting implementation has merged.

| Workstream | Linear parent | Intended outcome |
| --- | --- | --- |
| [Financial core and backend](../snapshots/backlog-2026-11-02.md#financial-core-and-backend--laz-31) | LAZ-31 | Owned management/history APIs, traceable calculations and explicit refund, budget-history and savings rules |
| [Web application](../snapshots/backlog-2026-11-02.md#web-application--laz-30) | LAZ-30 | Persistent, usable financial-management workflows with truthful amounts, freshness and session states |
| [Firebase identity](../snapshots/backlog-2026-11-02.md#firebase-identity--laz-29) | LAZ-29 | Verified subjects, stable internal ownership and isolated browser/SSR sessions |
| [External MCP authorization](../snapshots/backlog-2026-11-02.md#external-mcp-authorization--laz-27) | LAZ-27 | Client discovery, user grants, read-only permissions, expiry/revocation and reference-client verification |
| [Provider-neutral banking and Fintoc](../snapshots/backlog-2026-11-02.md#provider-neutral-banking-and-fintoc--laz-28) | LAZ-28 | Owned linking and repeatable normalized imports that preserve decisions and expose sync quality |
| [First-party text assistant](../snapshots/backlog-2026-11-02.md#first-party-text-assistant--laz-26) | LAZ-26 | Authenticated Spanish conversations grounded in existing financial services, without financial writes |

These are Linear issue identifiers, not GitHub PR numbers. For example, LAZ-26
is the text-assistant workstream; PR #26 is part of the platform work described
below.

## Cross-cutting work alongside the stage

While Stage B was being built, PRs #26, #27 and #28 changed the engineering
direction toward a shared financial capability layer with explicit persistence,
contract, ownership and session boundaries. The
[platform-evolution rationale](platform-evolution.md) explains why this supports
the product, what changed and what it does not deliver on behalf of the six
workstreams.

This is supporting work within Stage B, not another stage, a replacement backlog
or a gate decision. Current implementation details belong in the
[technical guides](../../technical/README.md); issue status continues to belong
in Linear.

## Completion and handoff

Use the [Stage B Definition of Done](definition-of-done.md) and each committed
issue's own acceptance checks. A merged refactor, authentication flow or private
procedure is implementation evidence, not proof that an entire product track
works end to end.

A closure record and retrospective belong in this folder **after the stage gate**,
using the [shared record template](../stage-sprint-record-template.md). Select
[Stage C](../stage-c/README.md) from the reviewed outcomes and remaining needs;
do not pre-populate its commitments from candidate features.

Return to the [planning index](../README.md) for shared methodology and release
criteria.
