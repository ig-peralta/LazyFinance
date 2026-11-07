# Stage A — Definition of Done

These checks apply to closing **Sprint A / Stage A**, not to an individual issue
or the whole product. The [issue snapshot](../snapshots/backlog-2026-11-02.md#sprint-a-stage-a--financial-core-validation)
preserves issue-specific criteria; the [product Definition of Done](../product-definition-of-done.md)
governs release. A scope change or deferral must be explicit in the gate record.

Sprint A is Done when:

- [ ] A repeatable CLP dataset and documented account, movement, tag, objective, and income semantics support the representative J1–J5 scenarios in the [user journeys](../../product/user-journeys.md).
- [ ] Balances, spending excluding internal movements, comparable periods, spending budgets, target-only savings goals, and expected versus confirmed received income produce coherent, user-scoped API/dashboard/MCP results. Unknown freshness and missing contribution measurements are explicit.
- [ ] The model's core assumptions are reconciled against tests and representative data. Decisions needed before provider ingestion are recorded, and nonblocking work is moved explicitly into Sprint B rather than claimed as delivered.
- [ ] A GO/NO-GO decision, reviewed Git baseline, test evidence, and limitations are available in the [Sprint A closure record](closure.md), with the [documentary retrospective](retrospective.md) identifying what to improve.

The Stage A gate **recorded GO on October 21, 2026** under a deliberately bounded **data-model foundation** scope. The documentation above assesses that recorded outcome after the fact; it does not claim this checklist was adopted before Sprint A began or that the team held a historical retrospective meeting.
