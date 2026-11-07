# Stage B — Definition of Done

These checks apply to closing **Sprint B / Stage B**, not to an individual issue
or the whole product. The [workstreams](README.md#workstreams-from-linear) and
[issue snapshot](../snapshots/backlog-2026-11-02.md#sprint-b-stage-b--parallel-product-tracks-in-progress)
provide scope and individual acceptance criteria. A scope change or deferral must
be explicit in the gate record, not hidden by a Done label.

Sprint B is Done when:

- [ ] The six workstreams in the [Sprint B Backlog](../snapshots/backlog-2026-11-02.md#sprint-b-stage-b--parallel-product-tracks-in-progress) have their committed child outcomes demonstrated or explicitly re-scoped at the gate: financial management/query semantics, usable web workflows, Firebase identity, external MCP authorization, provider-neutral Fintoc connectivity, and the first-party text assistant.
- [ ] An authenticated user can exercise the delivered flows end to end. Financial calculations and identifiers remain consistent across backend, UI, agent, and MCP; provider data and demo data are not confused. Two-user ownership, error/freshness states, and initial read-only boundaries are tested.
- [ ] Issue-specific completion checks and dependencies are verified with recorded tests/builds and linked implementation evidence; any blocked, unfinished, or deferred issue keeps its actual status and a documented reason.
- [ ] A stage gate records which workstream results passed, the Git baseline, unresolved product limitations, and the scope decision. A **dated work snapshot and retrospective** preserve what was learned and what needs attention in the next sprint.
- [ ] Only **after** reviewing Sprint B's actual results does the team select and create Sprint C issues, goal, priorities, and acceptance criteria. The current Sprint C milestone is a direction, not a pre-filled backlog.

The [platform-evolution record](platform-evolution.md) explains supporting changes
made while the stage was being built; it does not close this checklist. The
[product Definition of Done](../product-definition-of-done.md) remains a separate
release review.
