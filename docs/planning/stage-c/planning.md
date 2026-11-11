# Sprint C (Stage C) — scope and planning record

- **Decision date:** 2026-11-09, America/Santiago. Linear publication occurred on
  2026-11-10 UTC; the dates describe the same local planning evening.
- **Source:** written product-feedback scope, the Stage B review and a fresh
  complete Linear inventory. No separate planning meeting is claimed.
- **Predecessor gate:** [Stage B GO](../stage-b/closure.md), reviewed at `1cda504`.
- **Repository baseline:** `13f4b174cc08ed3210e14b9d09375d8ad1b96d56`.
- **Tracker:** LazyFinance workspace, P-LAZ-1 — LazyFinance product development,
  existing **Stage C - Expanded experience** milestone.
- **Target:** 2026-11-20, still tentative. No capacity estimate, individual due
  dates, owners or estimates were supplied. Initial priorities are revisable.
- **State:** selected plan, not delivered work or a stage/release approval.
- **Scope addition:** 2026-11-11 product direction adds required deployment,
  performance testing, a mock banking provider and substantial seed improvement
  ([details below](#required-scope-additions--2026-11-11)).

## Goal and expected demonstration

Make routine financial tasks clear and low-friction. A person can skip or resume
setup, connect a bank, choose accounts and see automatic updates without visiting
settings repeatedly; name accounts and classify movements; recognize external
grants; adapt the workspace; and use a readable, persistent assistant by text or
live voice without weakening financial meaning, privacy or explicit approval.
The stage also requires a working deployment, measured performance evidence and
representative synthetic banking/data support.

The [validation plan](validation-plan.md) defines observable demonstrations.
[Linear acceptance](#issue-structure-and-selection) owns the individual work;
the [stage DoD](definition-of-done.md) owns completion. Nothing here asserts that
the implementation or live checks already exist.

## Feedback traceability

C01–C18 preserve the order of the written brief. The wording below normalizes
the requests without treating an existing Stage B capability as absent.

| Brief | Requested outcome | Selection | Stage C issues |
| --- | --- | --- | --- |
| C01 | Less noise; clearer, more concise screens and copy | Required | LAZ-78; applies across the selected journeys |
| C02 | Include bank-provider setup in onboarding | Required improvement to existing setup | LAZ-97 |
| C03 | Improve tag management and movement classification | Required, separate catalog and correction experiences | LAZ-81, LAZ-77 |
| C04 | Redesign connected applications | Required | LAZ-80 |
| C05 | Simplify the bank-connection flow | Required | LAZ-88 |
| C06 | Keep the beginning of an assistant reply visible; hide references behind expansion | Required | LAZ-91, LAZ-92 |
| C07 | Synchronize banking automatically instead of routine manual updates | Required | LAZ-89, LAZ-90, LAZ-87 |
| C08 | Do not name the model/provider in chat | Required presentation change, not removal of privacy disclosure | LAZ-96 |
| C09 | Persistent minimizable assistant; colors consistent with the app | Required | LAZ-93 |
| C10 | External quotes/search or available marketplace/service APIs | Optional, highly desirable | LAZ-101 |
| C11 | Live voice conversation | Required | LAZ-95, LAZ-94 |
| C12 | Demonstrate banking transactions through the agent | Optional, isolated synthetic demonstration only | LAZ-103 |
| C13 | Text-size preferences, light mode, assistant shortcut, compact icon sidebar | Required | LAZ-82, LAZ-79, LAZ-84 |
| C14 | Set/change an account alias | Required | LAZ-85 |
| C15 | Choose accounts after Fintoc authorization | Required | LAZ-89, LAZ-86, LAZ-88 |
| C16 | Show connected-application logos | Required | LAZ-83 |
| C17 | Alerts for classification and critical savings/budget states | Optional | LAZ-102 |
| C18 | WhatsApp access | Optional | LAZ-104 |

Uber and MercadoLibre are examples to assess, not promised integrations or proof
of available APIs. “Live voice” means an interactive streaming session with
interruption and text fallback, not merely uploading an audio recording.

## Required scope additions — 2026-11-11

Follow-up product direction adds four **mandatory** deliverables. These extend
the original C01–C18 brief; they are not optional candidates or delivered work.

| Issue | General direction |
| --- | --- |
| LAZ-106 | Complete and verify a working Stage C deployment; document access, operation and limitations |
| LAZ-108 | Execute performance tests and record measured results, findings and limitations |
| LAZ-107 | Create a mock banking provider for representative connection, account-selection and synchronization journeys without real bank access |
| LAZ-105 | Substantially enrich the synthetic financial seed with varied, coherent history and useful everyday/edge-case scenarios |

All four are children of LAZ-76 and explicitly block the LAZ-99 stage review.
They were created as required Todo issues with initial High priority, no Optional
label and no assignee, estimate, due date or cycle. Selected Stage C scope is now
**38 records: 33 required (5 parents/28 children) and 5 optional**. The project
inventory contains 103 records; the original dated snapshots remain unchanged.

These are directions and acceptance outcomes, not implementation designs.
**Choose the deployment approach and performance-testing approach only when their
respective issues start.** Neither a deployment platform/topology nor performance
tools, workloads, environment or acceptance criteria are selected here. Mock design
and seed generation, volume and loading details also remain open. Recording a
plan, skipped check or carryover risk does not satisfy these required outcomes.

The mock provider is development/demo/validation support, separate from LAZ-103's
optional agent-assisted banking-action simulation. It does not promote that
candidate or authorize real money movement. LAZ-8's existing seed and LAZ-13's
local packaging remain completed predecessor work, not reopened issues. The
tentative November 20 target is unchanged.

## Issue structure and selection

The fresh inventory contained 65 completed Stage A/B issues and no Stage C work.
Their descriptions and relevant discussions were checked before creating
follow-ups. In particular, LAZ-70 already includes an optional banking shortcut;
LAZ-65/LAZ-67 already manage tags and corrections; LAZ-48/LAZ-49/LAZ-51/LAZ-62
already supply linking and manual snapshot recovery; LAZ-57–LAZ-59 already supply
text chat, grounding and evidence. Those records remain Done.

| Parent | Selected children | Purpose |
| --- | --- | --- |
| LAZ-75 | LAZ-78, LAZ-81, LAZ-77, LAZ-82, LAZ-84, LAZ-79 | Clear workspace, catalog/corrections, appearance and navigation |
| LAZ-74 | LAZ-89, LAZ-86, LAZ-90, LAZ-88, LAZ-87, LAZ-97, LAZ-85 | Synchronization policy, account selection, automation, guided setup and aliases |
| LAZ-72 | LAZ-93, LAZ-91, LAZ-92, LAZ-96, LAZ-95, LAZ-94 | Persistent assistant, reading/evidence, presentation/privacy and live voice |
| LAZ-71 | LAZ-80, LAZ-83 | Grant experience and safe application identity/logos |
| LAZ-76 | LAZ-98, LAZ-100, LAZ-106, LAZ-108, LAZ-107, LAZ-105, LAZ-99 | Experience/external checks, deployment, performance testing, mock/seed support and actual gate review |
| LAZ-73, Optional | LAZ-101, LAZ-103, LAZ-102, LAZ-104 | Quotes, simulation, alerts and WhatsApp |

At the original publication there were **34 new records: 29 required
(5 parents/24 children) and 5 optional (1 parent/4 candidates)**. Required issues were Todo;
optional issues were Backlog with the team label **Optional**. The label does not
change their milestone. All original issues and November 11 additions explicitly
belong to P-LAZ-1 and Stage C, with no separate cycle.

Core friction, banking, assistant/voice and validation initially have High
priority. Preferences, aliases, connected applications and the highly desirable
quote candidate have Medium priority; other optional work is Low. No priority is
a feasibility estimate. The [dated snapshot](../snapshots/backlog-2026-11-10-stage-c-planning.md)
preserves the exact initial fields; Linear remains the live tracker.

Optional work is visible in the same milestone but **does not block the required
gate**. Promotion must explicitly change its selection and acceptance impact.
At review record delivered, deferred or promoted, rather than quietly treating an
unfinished candidate as required or as shipped.

## Dependencies

- **Banking:** LAZ-89 settles provider-supported behavior before LAZ-86 persists
  selection. LAZ-90 reuses that selection for background work. LAZ-88 unifies
  selection/first sync and enrollment; LAZ-97 reuses that flow in onboarding.
  LAZ-87 presents automatic status/recovery. Alias management can proceed
  independently against the existing owned account boundary. The
  [LAZ-89 policy](banking-sync-policy.md) records the selected design and its
  isolated, portable synchronization boundary; implementation is not claimed.
- **Assistant:** LAZ-93 is the persistent host for LAZ-79's shortcut and LAZ-91's
  scroll lifecycle. LAZ-94 depends on that host, LAZ-95's voice contract and
  LAZ-96's processing-disclosure/presentation change. References and visual work
  must integrate without creating duplicate conversation state.
- **Connected apps:** grant presentation and logos are coordinated but do not add
  permissions or require a new MCP command surface.
- **Verification:** LAZ-98 depends on the four required feature workstreams;
  LAZ-100 records external integration checks. LAZ-99 depends on both and all four
  required November 11 additions: LAZ-106, LAZ-108, LAZ-107 and LAZ-105. Their
  acceptance evidence is required before closing the stage; no optional candidate
  blocks those issues automatically.

These are deliverable dependencies, not a claim that implementation is underway.
Use coherent reviews and explicitly recorded live-validation sessions, as the
[Stage B retrospective](../stage-b/retrospective.md#improvements-for-stage-c)
recommends.

## Product and technical decisions

| Decision | Required boundary now | Decision owner issue |
| --- | --- | --- |
| Automatic updates | [Selected policy](banking-sync-policy.md): hourly available-snapshot imports with jitter, bounded durable recovery/budgets and operational disable; no scheduled Refresh Intents. Live plan/cost remains to be confirmed | LAZ-89, LAZ-90 |
| Synchronization isolation | Separate trigger, sync application boundary, provider adapter and scoped persistence. Keep a headless composition path and explicit contracts so future service extraction does not duplicate ingestion | LAZ-89, LAZ-90 |
| Background authority | Restricted operational scheduling claims yield server-owned work; financial execution keeps ordinary user RLS and version checks. No owner runtime credentials, arbitrary client-selected user or general financial RLS bypass | LAZ-89, LAZ-90 |
| Account enrollment | Authorization alone does not select every account. Confirm selection before first import/automatic enrollment; new accounts stay unselected | LAZ-86, LAZ-88 |
| Selection changes | Version the selection and recheck it with credentials/lifecycle at commit. Stop future ingestion on deselection; retain labelled history, aliases and decisions | LAZ-89, LAZ-86 |
| Simpler setup | Confirm the chosen accounts and updates in one guided flow; preserve optional skip/resume, cancellation and honest progress | LAZ-88, LAZ-97 |
| Persistent chat | Retain the accepted conversation/draft in memory across authenticated navigation, not private browser storage. Minimize is different from stop/delete; logout clears private state | LAZ-93 |
| Reading and evidence | Reveal the new answer's beginning once, respect deliberate scrolling and offer explicit jump-to-latest. References start collapsed; approval cards remain visible | LAZ-91, LAZ-92 |
| Provider-neutral chat | Remove provider/model labels and vendor errors from chat, not the separate pre-processing disclosure or private operator configuration | LAZ-96 |
| Live voice | Select transport/provider, supported browsers, measurable response/stop bounds, explicit microphone lifecycle, retention and cost limits before implementation. Spoken agreement is never saved-action approval | LAZ-95, LAZ-94 |
| Preferences | Persist only non-sensitive settings; retain contrast, focus, accessible icon labels and usable maximum text size | LAZ-82, LAZ-84, LAZ-79 |
| Logos | Validate branding with format/origin/size/privacy controls and a fallback. Untrusted images do not verify a client or replace callback/permission facts | LAZ-83, LAZ-80 |
| Deployment | Required working deployment and verification; choose scope and approach when the issue starts, not in this plan | LAZ-106 |
| Performance testing | Required executed tests and measured evidence; choose scope, approach and acceptance criteria when the issue starts | LAZ-108 |
| Mock banking provider | Required synthetic banking journeys through the existing provider-neutral boundary; design remains open and real banking access is not implied | LAZ-107 |
| Richer seed | Required substantial improvement in representative, coherent synthetic financial scenarios; generation, volume and loading details remain open | LAZ-105 |
| Optional quotations | Select feasible search/API access and terms; show source/time/currency/missing costs without exporting financial history or purchasing | LAZ-101 |
| Optional critical alerts | Define eligibility and thresholds; deliberate no-tag, incomplete history and savings allocations cannot be relabelled as financial failure | LAZ-102 |
| Optional external channels/actions | Simulation is isolated and labelled; WhatsApp needs explicit identity binding, consent, revocation and a bounded capability set | LAZ-103, LAZ-104 |

The existing [architecture](../../technical/architecture.md),
[banking contract](../../../apps/api/src/banking/README.md),
[assistant boundary](../../technical/financial-assistant.md),
[MCP authorization](../../technical/mcp-authorization.md) and
[UI lifetimes](../../technical/ui-data-lifecycle.md) remain authoritative for
current implementation. Update those guides with implementation, not ahead of it.

## Exclusions and Stage B carryovers

The brief does **not** select broader MCP management, advanced
forecasts/anomalies, additional real banking integrations beyond Fintoc,
shared/family ownership or pre-link historical backfill. Keep the Stage B MCP follow-up visible but deferred
until its exact operations and permissions are selected. Existing bounded direct
MCP execution is not missing functionality. The required mock provider is synthetic
support, not an additional real banking integration.

Real money movement is not selected. The optional demo cannot connect real bank
write credentials, change real balances or quietly enable a production executor.
Optional quotes do not imply shopping/payment authority or unrestricted browsing.

The [Stage B carryovers](../stage-b/closure.md#accepted-limitations-and-carryovers)
retain their status: live model quality, two-user Firebase acceptance, the current
tracking cutoff against the provider, required external-client writes, dependency
advisories, capacity and operational limits and privacy/retention/cost. Deployment
and performance testing are now explicit required deliverables in LAZ-106 and
LAZ-108, not merely risks for disposition. LAZ-100 plans targeted external
evidence; LAZ-99 must record unresolved risks without substituting risk notes for
required delivery. No deployment, performance run, new audit, provider benchmark
or release certification was performed to write this plan.

## Review and change record

This scope record is not closure. On 2026-11-10 the LAZ-89 implementation review
selected the [banking synchronization design](banking-sync-policy.md), including
the explicit requirement for isolated boundaries and future service extraction.
That decision is not delivered automation, plan verification or a live test.

On 2026-11-11, follow-up product direction added
the four required issues above. The Linear milestone, scope document, LAZ-76 and
LAZ-99 now include them; each new issue blocks LAZ-99. This is a scope decision,
not an implementation or validation result. Deployment and performance-testing
choices remain deferred to issue work. The original dated snapshots remain unchanged.

At review, record additions, promotions, deferrals and their reasons; the exact
build and checks; unresolved risks; the actual gate outcome; and retrospective
provenance. Do not invent a meeting, acceptance result or owner. Apply the separate
[product DoD](../product-definition-of-done.md) before any release decision.
