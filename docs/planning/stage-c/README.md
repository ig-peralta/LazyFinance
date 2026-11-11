# Stage C — expanded experience

**Scope selected on 2026-11-09 (America/Santiago); implementation is not claimed.**
Make everyday financial management clear and low-friction: guided bank setup,
chosen accounts kept up to date automatically, easier classification, a persistent
readable assistant and live voice. **The November 11 scope addition also requires
deployment, performance testing, a mock banking provider and substantial seed
improvement.** Deployment and performance-test approaches are decided when those
issues start, not by this plan.

Stage B's [closure](../stage-b/closure.md) and
[retrospective](../stage-b/retrospective.md) supply the foundation and accepted
limitations. Its GO was reviewed against `main` at `1cda504`; this planning review
uses repository baseline `13f4b17`. The original
[November 9 snapshot](../snapshots/backlog-2026-11-09.md) remains unchanged.

## Selected scope

The [planning snapshot](../snapshots/backlog-2026-11-10-stage-c-planning.md)
records the **original 34 issues** in the existing Stage C milestone. The
[November 11 addition](planning.md#required-scope-additions--2026-11-11) adds four
required children; the selected workstreams now contain:

| Workstream | Parent | Children | Selection |
| --- | --- | --- | --- |
| Clear workspace, tagging and preferences | LAZ-75 | 6 | Required |
| Bank setup, account selection, aliases and automatic synchronization | LAZ-74 | 7 | Required |
| Persistent, readable assistant and live voice | LAZ-72 | 6 | Required |
| Recognizable connected applications | LAZ-71 | 2 | Required |
| Validation, deployment, performance and mock/seed support | LAZ-76 | 7 | Required |
| External quotes, synthetic banking-action demo, alerts and WhatsApp | LAZ-73 | 4 | Optional |

There are now **33 required records** (5 parents and 28 children) and **5 Optional
records** (1 parent and 4 candidates): **38 Stage C records** in total.
LAZ-106 (deployment), LAZ-108 (performance testing), LAZ-107 (mock banking provider)
and LAZ-105 (richer seed) were added as required Todo issues and each blocks LAZ-99.
The original snapshot preserves initial states; Linear owns current delivery status.
Optional membership does not make a candidate a completion blocker. Record an
explicit promotion, delivery or deferral decision at review.

One stage milestone remains one sprint; no Linear cycle is added. The existing
**2026-11-20 target remains tentative**. At initial publication, capacity, owners,
estimates and individual due dates had not been agreed; priorities are relative
ordering, not a delivery forecast. Linear owns their live values.

## Planning documents

| Document | Responsibility |
| --- | --- |
| [Scope and planning record](planning.md) | All 18 feedback items, required/optional selection, dependencies, decisions and exclusions |
| [Validation plan](validation-plan.md) | Observable journeys, appropriate evidence and unresolved live checks |
| [Stage Definition of Done](definition-of-done.md) | Required completion and gate checks, all still open |
| [Dated issue snapshot](../snapshots/backlog-2026-11-10-stage-c-planning.md) | Complete project inventory after selection; not a live board |
| [Product requirements](../../product/product-requirements.md) and [journeys](../../product/user-journeys.md#stage-c---selected-everyday-experience-and-live-voice) | User-facing behavior and planned outcomes |

The internal Linear document **Stage C — Scope, acceptance and validation** links
the same workstreams and their issue-level acceptance criteria. No closure or
retrospective is fabricated in advance; create those records after the actual
review using the [shared template](../stage-sprint-record-template.md).

## Boundaries and completion

Broader MCP management was identified in the Stage B review but is **not selected
by this scope brief**. Existing bounded assistant/MCP actions already work within
their documented permission boundaries. Additional commands need a separate
operation/permission decision. Advanced analysis, additional real banking integrations,
shared ownership and historical backfill also remain unselected.

The required mock banking provider is synthetic development/demo/validation
support, not a real banking integration or the optional agent banking-action demo.
The four November 11 additions need actual delivery evidence; recording a plan,
skipped check or carryover risk does not satisfy the stage gate.

The optional banking-action demo is isolated simulation, not permission to move
real money. Automatic bank updates must respect provider capabilities and must
not disguise stale source data as fresh. Removing model/provider labels from chat
does not remove separate processing/privacy disclosure.

Apply this stage's [DoD](definition-of-done.md), then the separate
[product release checklist](../product-definition-of-done.md). Stage B's
live-validation/security/operational carryovers remain explicit release concerns,
not checks that passed merely because planning began.
