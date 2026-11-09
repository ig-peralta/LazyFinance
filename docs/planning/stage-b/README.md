# Stage B — parallel product tracks

Stage B connected usable experiences and real-user access to the same trustworthy
financial capabilities after the financial-core gate. It closed on **2026-11-09**
with **GO to Stage C planning**, against `main` at `1cda504`, with explicit
development-stage limitations. See the [closure](closure.md) and
[retrospective](retrospective.md).
See the [product direction](../../product/product-vision.md#stage-b--advance-several-tracks-after-core-validation).

## Workstreams from Linear

The [November 9 snapshot](../snapshots/backlog-2026-11-09.md#sprint-b-stage-b--parallel-product-tracks)
records all six parent workstreams and 40 child issues **Done**. The table below
summarizes delivered outcomes; the closure supplies implementation links,
verification and accepted exceptions.

| Workstream | Linear parent | Delivered outcome |
| --- | --- | --- |
| [Financial core and backend](../snapshots/backlog-2026-11-09.md#financial-core-and-backend) | LAZ-31 | Owned management/history APIs, purchase-attributed recoveries, revisioned budgets, measured savings and paginated evidence |
| [Web application](../snapshots/backlog-2026-11-09.md#web-application) | LAZ-30 | Persistent financial-management, onboarding and banking workflows; truthful states, browser-owned sessions and public-prerender/private-CSR rendering |
| [Firebase identity](../snapshots/backlog-2026-11-09.md#firebase-identity) | LAZ-29 | Verified-subject mapping, stable internal ownership, browser-session isolation, Google/password access and same-UID credential linking; live acceptance exception retained |
| [External MCP authorization](../snapshots/backlog-2026-11-09.md#external-mcp-authorization) | LAZ-27 | OAuth discovery, consent, grants, expiry/revocation and reference-client checks; later bounded writes require separate optional consent |
| [Provider-neutral banking and Fintoc](../snapshots/backlog-2026-11-09.md#provider-neutral-banking-and-fintoc) | LAZ-28 | Owned linking and manual normalized import/refresh/recovery, preserving decisions and exposing access/source freshness and first-link tracking limits |
| [First-party text assistant](../snapshots/backlog-2026-11-09.md#first-party-text-assistant) | LAZ-26 | Grounded Spanish text-chat pipeline, references, bounded history/streaming and explicit versioned action cards; live-model quality remains unverified |

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

Later deliveries added financial rules/evidence, private CSR/static hosting,
Fintoc lifecycle/recovery, OAuth and the assistant/action ledger. The final baseline
has 29 migrations and 78 public / 94 private procedures. Current implementation
details belong in the [technical guides](../../technical/README.md); issue status
continues to belong in Linear.

## Completion and handoff

Use the [Stage B Definition of Done](definition-of-done.md) and each committed
issue's own acceptance checks. A merged refactor, authentication flow or private
procedure is implementation evidence, not proof that an entire product track
works end to end.

The [closure](closure.md) accepts the bounded action expansion beyond the original
read-only wording and records all remaining live-validation and operational gaps.
MCP direct writes already exist; **broader MCP management tools** are the identified
functional follow-up. The [retrospective](retrospective.md) recommends smaller
coherent reviews and explicit live-validation sessions.

Select [Stage C](../stage-c/README.md) from those outcomes and remaining needs.
There are no Stage C issues in the November 9 snapshot. Stage B closure is not
product release approval.

Return to the [planning index](../README.md) for shared methodology and release
criteria.
