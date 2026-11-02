# Product Definitions of Done for Sprint A, B, and C

**One stage milestone equals one sprint.** Each milestone's assigned issues are its Sprint Backlog. The [dated issue snapshot](snapshots/backlog-2026-11-02.md) provides each issue's own product-completion criteria; the checks here apply to closing the **whole sprint**, and the [product Definition of Done](product-definition-of-done.md) applies to the release as a whole. A scope change or deferral must be explicit in the gate record, not hidden by a Done label.

## Sprint A — financial-core validation

Sprint A is Done when:

- [ ] A repeatable CLP dataset and documented account, movement, tag, objective, and income semantics support the representative J1–J5 scenarios in the [user journeys](../product/user-journeys.md).
- [ ] Balances, spending excluding internal movements, comparable periods, spending budgets, target-only savings goals, and expected versus confirmed received income produce coherent, user-scoped API/dashboard/MCP results. Unknown freshness and missing contribution measurements are explicit.
- [ ] The model's core assumptions are reconciled against tests and representative data. Decisions needed before provider ingestion are recorded, and nonblocking work is moved explicitly into Sprint B rather than claimed as delivered.
- [ ] A GO/NO-GO decision, reviewed Git baseline, test evidence, and limitations are available in the [Sprint A closure record](snapshots/stage-a-closure.md), with the [documentary retrospective](stage-a-retrospective.md) identifying what to improve.

The Stage A gate **recorded GO on October 21, 2026** under a deliberately bounded **data-model foundation** scope. The documentation above assesses that recorded outcome after the fact; it does not claim this checklist was adopted before Sprint A began or that the team held a historical retrospective meeting.

## Sprint B — parallel product tracks

Sprint B is Done when:

- [ ] The six workstreams in the [Sprint B Backlog](snapshots/backlog-2026-11-02.md) have their committed child outcomes demonstrated or explicitly re-scoped at the gate: financial management/query semantics, usable web workflows, Firebase identity, external MCP authorization, provider-neutral Fintoc connectivity, and the first-party text assistant.
- [ ] An authenticated user can exercise the delivered flows end to end. Financial calculations and identifiers remain consistent across backend, UI, agent, and MCP; provider data and demo data are not confused. Two-user ownership, error/freshness states, and initial read-only boundaries are tested.
- [ ] Issue-specific completion checks and dependencies are verified with recorded tests/builds and linked implementation evidence; any blocked, unfinished, or deferred issue keeps its actual status and a documented reason.
- [ ] A stage gate records which workstream results passed, the Git baseline, unresolved product limitations, and the scope decision. A **dated work snapshot and retrospective** preserve what was learned and what needs attention in the next sprint.
- [ ] Only **after** reviewing Sprint B's actual results does the team select and create Sprint C issues, goal, priorities, and acceptance criteria. The current Sprint C milestone is a direction, not a pre-filled backlog.

## Sprint C — expanded product experience and release handoff

Sprint C is planned **after Sprint B closes**. Its specific issue commitments and measures will be written from that review rather than invented in advance. Once agreed, Sprint C is Done when:

- [ ] Every issue selected for Sprint C meets its own documented completion checks, or an exception is explicitly accepted and reported. The sprint goal and scope changes are traceable to the Sprint B review.
- [ ] Voice, advanced analysis, and additional provider work are demonstrated **if selected into the agreed release scope**; otherwise their deferral and effect on the product experience are documented.
- [ ] The final cross-component demonstration, test results, user and technical documentation, stage snapshot, retrospective, and remaining limitations are ready for the [product release review](product-definition-of-done.md).

Sprint C closure alone does not assert product completion: the product DoD also requires a repeatable, secure, supported release of the committed user flows.
