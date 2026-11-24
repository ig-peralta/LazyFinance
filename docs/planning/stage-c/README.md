# Stage C — expanded experience

**Gate reviewed on 2026-11-24 (America/Santiago): GO for development closure.**
See the [gate record](closure.md) and [retrospective](retrospective.md). This does
not approve a production release. Planning baselines below retain their original
scope dates and decisions.

Make everyday financial management clear and low-friction: guided bank setup,
chosen accounts kept up to date automatically, easier classification, a persistent
readable assistant and live voice. **The November 11 scope addition also requires
deployment, performance testing, a mock banking provider and substantial seed
improvement.** The November 24 addition requires recorded security regression
results. Delivery and verification approaches are decided when the issues start.

Stage B's [closure](../stage-b/closure.md) and
[retrospective](../stage-b/retrospective.md) supply the foundation and accepted
limitations. Its GO was reviewed against `main` at `1cda504`; this planning review
uses repository baseline `13f4b17`. The original
[November 9 snapshot](../snapshots/backlog-2026-11-09.md) remains unchanged.

## Selected scope

The [planning snapshot](../snapshots/backlog-2026-11-10-stage-c-planning.md)
records the **original 34 issues** in the existing Stage C milestone. The
[November 11 addition](planning.md#required-scope-additions--2026-11-11) adds four
required children and the [November 24 addition](planning.md#required-scope-addition--2026-11-24)
adds security verification. The selected workstreams now contain:

| Workstream | Parent | Children | Selection |
| --- | --- | --- | --- |
| Clear workspace, tagging and preferences | LAZ-75 | 6 | Required |
| Bank setup, account selection, aliases and automatic synchronization | LAZ-74 | 7 | Required |
| Persistent, readable assistant and live voice | LAZ-72 | 6 | Required |
| Recognizable connected applications | LAZ-71 | 2 | Required |
| Validation, deployment, performance, security and mock/seed support | LAZ-76 | 8 | Required |
| External quotes, synthetic banking-action demo, alerts and WhatsApp | LAZ-73 | 4 | Optional |

There are now **34 required records** (5 parents and 29 children) and **5 Optional
records** (1 parent and 4 candidates): **39 Stage C records** in total.
LAZ-106 (deployment), LAZ-108 (performance testing), LAZ-107 (mock banking provider)
and LAZ-105 (richer seed) each block LAZ-99, as does LAZ-109 (security verification).
The original snapshot preserves initial states; Linear owns current delivery status.
All four optional candidates were [deferred at the gate](closure.md#optional-outcomes);
their Backlog states are preserved, and none became a completion blocker.

One stage milestone remains one sprint; no Linear cycle was added. The
**2026-11-20 target was tentative**. Priorities were relative ordering, not a
delivery forecast. Linear owns current assignments and issue states.

## Planning documents

| Document | Responsibility |
| --- | --- |
| [Stage C closure](closure.md) and [retrospective](retrospective.md) | Reviewed baseline, accepted development outcomes, limitations and follow-ups |
| [Integrated experience delivery](experience-delivery.md) | Four requested feature workstreams, PR stack, executed combined verification and remaining release gates; not Stage C closure |
| [Scope and planning record](planning.md) | All 18 feedback items, required/optional selection, dependencies, decisions and exclusions |
| [Selected-account synchronization policy](banking-sync-policy.md) | LAZ-89 decision and implemented selection/consent, isolated portable execution, background authority and recovery; live enablement remains gated |
| [Banking delivery](banking-delivery.md) and [browser verification](banking-browser-validation.md) | LAZ-74 implementation traceability, executed local checks and explicit unverified operational limits |
| [Workspace delivery](workspace-delivery.md) | LAZ-75 workflows, preferences, shortcut integration and executed Chromium/accessibility screening |
| [Architecture diagrams](../../diagrams/README.md) | Current ER and 4+1 views, configured development topology and a separate production proposal |
| [Financial assistant](../../technical/financial-assistant.md) and [live voice contract](../../technical/assistant-live-voice.md) | LAZ-72 persistent conversation/voice implementation, privacy, review fixes and remaining live-provider gates |
| [Integrated assistant browser validation](assistant-browser-validation.md) | Final mocked Chromium matrix, deferred-focus regression/fix, responsive/accessibility results and synthetic voice boundaries |
| [Validation plan](validation-plan.md) | Planned journeys and evidence tiers; results are in the closure record |
| [Performance testing](performance-testing.md) | LAZ-108 scope, measured run evidence, acceptance and limitations; reproducible Docker suite |
| [Security testing](security-testing.md) | LAZ-109 regression evidence, reproducible checks and open dependency/release risks |
| [Stage Definition of Done](definition-of-done.md) | Assessed development gate criteria and acceptance limits |
| [Gate snapshot](../snapshots/backlog-2026-11-24-stage-c-gate.md) and [planning snapshot](../snapshots/backlog-2026-11-10-stage-c-planning.md) | Complete dated project inventories at review and at original selection; neither is a live board |
| [Product requirements](../../product/product-requirements.md) and [journeys](../../product/user-journeys.md#stage-c---selected-everyday-experience-and-live-voice) | User-facing behavior and planned outcomes |

The internal Linear document **Stage C — Scope, acceptance and validation** links
the same workstreams and their issue-level acceptance criteria. The closure and
retrospective follow the [shared template](../stage-sprint-record-template.md).

## Boundaries and completion

Broader MCP management was identified in the Stage B review but is **not selected
by this scope brief**. Existing bounded assistant/MCP actions already work within
their documented permission boundaries. Additional commands need a separate
operation/permission decision. Advanced analysis, additional real banking integrations,
shared ownership and historical backfill also remain unselected.

The required mock banking provider is synthetic development/demo/validation
support, not a real banking integration or the optional agent banking-action demo.
The four November 11 additions need actual delivery evidence; recording a plan,
skipped check or carryover risk does not satisfy the stage gate. LAZ-109 likewise
requires executed tests and an explicit disposition of remaining risks.

The optional banking-action demo is isolated simulation, not permission to move
real money. Automatic bank updates must respect provider capabilities and must
not disguise stale source data as fresh. Removing model/provider labels from chat
does not remove separate processing/privacy disclosure.

The [product release checklist](../product-definition-of-done.md) remains open.
The [review's open follow-ups](closure.md#open-release-follow-ups) identify what
the confirmed development workflows do not establish for release.
