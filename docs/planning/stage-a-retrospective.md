# Sprint A (Stage A) retrospective — summary for team review

- **Prepared:** 2026-11-02
- **Scope:** Stage A financial-core validation, up to the GO decision on 2026-10-21.

This is an analysis of Git history, GitHub pull requests, and the team's Linear issue records, **not minutes of a team retrospective meeting**. The observations below are supported by those records; the improvements are proposals for the team to discuss and assign, not decisions attributed to everyone. The [Stage A closure record](snapshots/stage-a-closure.md) and [full backlog snapshot](snapshots/backlog-2026-11-02.md) reproduce the reviewed issue inventory and gate outcome for readers without tracker access.

The [Stage A closure snapshot](snapshots/stage-a-closure.md) indexes the completed milestone issues as captured from Linear after the gate. Live issue tracking remains in Linear; this review and the snapshot are repository evidence created after the stage was completed.

## Summary for discussion

- **Stage closed:** October 21, 2026, when the last Sprint A issue (LAZ-15) was marked Done at 08:46 UTC. The financial-core gate (LAZ-18) recorded GO earlier that day at 06:16 UTC.
- **What worked:** Repeatable CLP demo data and shared API, dashboard, and MCP logic made the J1–J5 financial scenarios demonstrable before Fintoc integration. The gate explicitly separated a validated model from features deferred to Sprint B.
- **Decisions recorded during Sprint A:** Validate the financial model with controlled data before Fintoc; identify internal movements by financial semantics rather than tag names; allow at most one tag per transaction; show savings goals without invented progress; and distinguish expected income from confirmed receipts. The GO decision deferred broader management workflows to Sprint B.
- **What created friction:** Transfer and income assumptions needed correction, transaction classification changed across several layers, and some work was entered into Linear after delivery.
- **Improvements proposed for team decision:** Capture each future sprint's selected issues when planning begins; record verification for financially significant changes; settle financial semantics with examples before cross-layer implementation; reconcile superseded gate wording. These are **proposals**, not claims of decisions made at a meeting.

## Evidence and outcome

- The Stage A milestone targeted **October 20**. Its **19 issues** were Done when reviewed for this document; gate issue LAZ-18 recorded the final **GO** on **October 21**, against merged [`main` at `72f9134`](https://github.com/ig-peralta/LazyFinance/commit/72f9134). The gate was decided one calendar day after the milestone target.
- The gate review reports J1–J5 passing under the agreed **demo-backed data-model scope**, with reconciled balances and spending, user-scoped HTTP/MCP results, and explicit limitations. It records 85 API tests (including five PostgreSQL integration scenarios), 46 UI regression tests, typecheck, builds, migrations, and repeatable seeding from the reviewed source tree. These are **results recorded at the gate**, not test runs performed for this retrospective.
- In J4, a savings goal passes only as a **target without invented progress**. Contribution counting remains Stage B work. Stage A GO does not mean finished banking connectivity, full financial-management workflows, a first-party agent, or a frozen schema. The final scope decision in LAZ-18 and the handoff in LAZ-15 place that broader work in Stage B.

The recorded gate reconciliation included September debit spending of **CLP 1,466,100** after excluding **CLP 215,100** in internal transfer/card-payment debit legs, while **CLP 19,700** in untagged spending remained in the total. The monthly grocery budget spent **CLP 201,500** in August and **CLP 200,400** in September against a CLP 280,000 limit. September expected income was **CLP 1,870,000** (including CLP 120,000 estimated), distinct from **CLP 1,772,000** received. These figures are historical validation evidence, not a claim about current user data.

- [Demo ledger PR #2](https://github.com/ig-peralta/LazyFinance/pull/2), [demo auth PR #3](https://github.com/ig-peralta/LazyFinance/pull/3), [dashboard PR #5](https://github.com/ig-peralta/LazyFinance/pull/5), and [MCP reads PR #6](https://github.com/ig-peralta/LazyFinance/pull/6) established a repeatable, user-scoped base for comparing the same financial scenarios across the API, UI, and MCP before integrating Fintoc.
- LAZ-17 and [PR #7](https://github.com/ig-peralta/LazyFinance/pull/7) replaced tag-name-based spending exclusion with an explicit internal-movement flag.
- LAZ-19, [PR #8](https://github.com/ig-peralta/LazyFinance/pull/8), and [PR #9](https://github.com/ig-peralta/LazyFinance/pull/9) clarified balance type and freshness. PR #8 merged into the feature branch; PR #9 merged that work to `main`.
- LAZ-23 and [PR #10](https://github.com/ig-peralta/LazyFinance/pull/10) replaced the overlapping-tag model with a single optional transaction tag, changing migration, seed, summaries, and exposed contracts together.
- LAZ-25 and [PR #11](https://github.com/ig-peralta/LazyFinance/pull/11) separated expected payments, confirmed receipts, and unclassified credits instead of treating any positive credit as income.

## What worked

1. **Validate financial meaning before adding provider data.** The team changed direction from the Fintoc-first Phase 1 plan to the core-first approach documented in the [product requirements](../product-requirements.md). PRs #7, #10, and #11 show concrete corrections found while the model could still be exercised with controlled data. The gate could be reviewed without relying on a bank sandbox.
2. **Use observable journeys rather than a schema-only sign-off.** [J1–J5](../user-journeys.md) connect balance, spending, budget, savings, and income questions to LAZ-19 through LAZ-23 and LAZ-25 in the [backlog snapshot](snapshots/backlog-2026-11-02.md). The gate review recorded both results and limitations instead of treating a screen or table as sufficient proof.
3. **Keep a deliberate scope boundary.** LAZ-16/LAZ-20 avoid displaying fictitious savings progress; LAZ-15 and LAZ-18 distinguish model validation from later CRUD/UI work. This made a defensible GO decision possible without claiming that Stage B functionality was finished.

## Friction and lessons

1. **Issue history is not a prospective sprint plan.** Several foundation issues, including LAZ-6 through LAZ-14 in the [Stage A record](snapshots/stage-a-closure.md), were created and marked Done on October 17 after related implementation was already merged. Their Stage A milestone membership provides the completed **Sprint A Backlog**, but cannot establish what was selected at its start. No separate Linear cycles were used.
2. **Cross-cutting model corrections are costly to review.** The decision in LAZ-23 touched 31 files in [PR #10](https://github.com/ig-peralta/LazyFinance/pull/10); income work in [PR #11](https://github.com/ig-peralta/LazyFinance/pull/11) touched 42. This was necessary to keep schema, seed, contracts, and calculations consistent, but highlights the value of settling semantics and acceptance examples before implementation where possible.
3. **A final decision should supersede old text everywhere.** The internal gate review opened with the final GO and LAZ-15 is now Done, but an older dependency section still said LAZ-15 was Todo. The local [closure record](snapshots/stage-a-closure.md) states the final sequence: LAZ-18 GO at 06:16 UTC and LAZ-15 Done at 08:46 UTC on October 21.

## Proposed Stage B improvements — for team review

1. **Capture planned work before it starts.** Foundation issues were entered after delivery, and Sprint A has no start-of-sprint selection record. At the next stage transition, record the sprint goal and selected milestone issues in Linear with priorities and owners using the [stage-sprint record fields](stage-sprint-record-template.md); preserve their final worklist in the completed-stage snapshot.
2. **Record verification on future issues.** For the next financial-model change, verify its [individual Done when condition](snapshots/backlog-2026-11-02.md), reconcile representative scenarios, and record applicable test/build results before marking Done. The [Sprint B DoD](sprint-definitions-of-done.md#sprint-b--parallel-product-tracks) governs the wider gate; do not retroactively certify Sprint A against a later standard.
3. **Decide financial meaning before changing several surfaces.** PRs #7, #10, and #11 corrected assumptions across the model and interfaces. Use a concrete scenario and recorded decision before implementing savings eligibility LAZ-35 or refund treatment LAZ-36 (both in the [backlog snapshot](snapshots/backlog-2026-11-02.md)), then check the API/UI/MCP meanings together.
4. **Reconcile superseded gate text.** The internal gate review has an earlier LAZ-15 Todo statement alongside its final GO after LAZ-15 closure. Annotate the superseded passage there; the [local closure record](snapshots/stage-a-closure.md) already gives the final disposition to external reviewers.

**Team discussion still needed:** participants should confirm which lessons they agree with, assign owners and dates to the proposals they adopt, and record that discussion as a separate dated team retrospective. This document is the evidence review to bring to that conversation.
