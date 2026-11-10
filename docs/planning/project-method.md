# Capstone methodology (metodología)

LazyFinance uses **iterative and incremental development with agile practices, without a formal Scrum framework**. This is the approach described in the [Phase 1 project definition](../submissions/fase1/1.5_GuiaEstudiante_Fase%201_Definicion%20Proyecto%20APT%20%28Espa%C3%B1ol%29.docx) and [technical report](../submissions/fase1/1.4_APT122_FormativaFase1.docx), and carried forward in the [Phase 2 progress guide](../submissions/fase2/2.4_GuiaEstudiante_Fase%202_DesarrolloProyecto%20APT%20%28Espa%C3%B1ol%29.docx). The [product vision](../product/product-vision.md) explains the direction, and the [product requirements](../product/product-requirements.md) describe what the product must achieve; this document explains how we plan, build, check, and record progress.

## Why this approach fits

Financial answers depend on decisions about balances, transfers, budgets, income, ownership, and data freshness. A large integration-first build could hide mistakes in those meanings until late in the semester. Small, demonstrable increments let us test those decisions against repeatable CLP demo scenarios, revise the model, and then add the UI, identity, bank adapters, and agent without conflating a working interface with validated financial results. The team can reprioritize work when a scenario exposes a missing capability while retaining acceptance criteria and a record of the decision.

The Phase 1 guide proposed starting with Fintoc. The Phase 2 guide and the current [product vision](../product/product-vision.md#development-sequence-and-decision-gates) record the change to **core validation before Fintoc**. The [Stage A gate](stage-a/closure.md) validated the financial-model foundation; the [Stage B closure](stage-b/closure.md) records the subsequent six-track delivery and its GO to Stage C planning on 2026-11-09. Provider and model verification limits remain explicit at that gate.

While Stage B was being built, the [platform direction evolved](stage-b/platform-evolution.md)
toward shared financial capabilities with explicit persistence, contract, identity
and session boundaries. This supports the existing product intentions rather than
replacing the six Stage B workstreams. The [planning index](README.md) separates
that rationale from stage criteria, historical evidence and current technical
specifications.

## Planning and execution

1. **Define the outcome.** The [product vision](../product/product-vision.md#product-vision), [requirements](../product/product-requirements.md) and [user journeys](../product/user-journeys.md) provide the problem, intended result, and observable scenarios. The team tracks acceptance and verification criteria on its Linear issues; the reviewer-facing [backlog snapshot](snapshots/backlog-2026-11-10-stage-c-planning.md) reproduces their inventory and recorded fields.
2. **Choose a small increment.** Within the team's Linear project, identify dependencies, priority, ownership, and the next demonstrable result. **Each stage milestone is one sprint** (Sprint A, B, or C), and **the issues assigned to that milestone are its Sprint Backlog**. The [backlog and stage evidence guide](backlog.md) and dated snapshot make the plan readable without tracker access. The team does not claim a formal Scrum framework or uniform sprint durations.
3. **Implement and validate.** Work is reviewed in Git and checked against the issue's acceptance criteria, relevant automated tests, and user-scoped financial behavior. The [November 2 checkpoint](snapshots/backlog-2026-11-02.md) preserves individual **Done when** summaries; the [stage definitions of done](README.md#stage-gates) and [product Definition of Done](product-definition-of-done.md) apply to broader closure decisions. Record controlled, sandbox/live and informal evidence separately. Completing one issue does not close a sprint or release the product.
4. **Review and adjust.** Demonstrate the result against representative scenarios, record what passed or remains open, and change the next increment if necessary. Decisions affecting scope or financial meaning belong in the relevant product/technical document and issue. **At stage closure**, capture the work, baseline, evidence and gate outcome in a dated repository [record](stage-b/closure.md); Linear continues to hold the live backlog. The [latest snapshot](snapshots/backlog-2026-11-10-stage-c-planning.md) makes the inventory accessible to reviewers.

The original Phase 1 plan listed Ignacio's initial focus as banking connectivity and the text agent, Alejandra's as financial logic and the dashboard, and Álvaro's as MCP and voice. The Phase 2 guide explains that work is shared rather than restricted to those areas. A task's current Linear assignee records its owner when one has been assigned; every team member participates in planning, validation, and documentation.

## Sprint Backlogs and stage snapshots

When a stage is completed, retrieve its milestone issues from Linear and preserve a **dated closure record** in the repo, including issue IDs and completion times, gate decision, Git baseline, verification, limitations and retrospective. [Stage A](stage-a/closure.md) records its 2026-10-21 financial-model GO; [Stage B](stage-b/closure.md) records its 2026-11-09 development-stage GO and accepted carryovers. Stage-specific records and criteria live in [their stage folders](README.md#read-by-stage); cross-stage exports remain in `snapshots/`.

The Stage A, B, and C milestones are **Sprint A, Sprint B, and Sprint C**. Each milestone's issues are its Sprint Backlog; there are **no separate Linear cycles or smaller sprints**. Use the [stage-sprint record fields](stage-sprint-record-template.md) for the goal, selected scope, dependencies, acceptance checks and review outcomes.

**Stage C scope was selected on 2026-11-09 after the completed Stage B review.**
The [planning record](stage-c/planning.md) traces the written feedback into 29
required and 5 Optional issue records under the existing milestone, including live
voice and automatic selected-account banking. The
[new extraction](snapshots/backlog-2026-11-10-stage-c-planning.md) preserves their
initial fields; the earlier November 9 closure snapshot remains unchanged.
Broader MCP management is an identified but unselected follow-up. Live-validation
and operational risks retain their release implications. November 20 remains
tentative; no owners, estimates or individual deadlines were invented, and an
optional candidate requires explicit promotion to become a gate commitment.

The [Stage B retrospective](stage-b/retrospective.md) records reusable financial semantics, predictable rendering and coherent deliveries, with smaller coherent reviews and explicit live-validation sessions as the next-stage improvements.
