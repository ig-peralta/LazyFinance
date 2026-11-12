# Stage C — Definition of Done

**Scope selected 2026-11-09 after Stage B's GO to planning.** The
[planning record](planning.md) traces all 18 feedback items and the
[snapshot](../snapshots/backlog-2026-11-10-stage-c-planning.md) records 29 required
issues (5 parents/24 children) plus 5 Optional records at initial selection.
The [November 11 addition](planning.md#required-scope-additions--2026-11-11) adds
four mandatory children: **33 required and 5 Optional records** in total. This
checklist remains open; selection is not implementation or verification.

## Required outcomes

- [ ] **Clear and adaptable workspace.** Concise Spanish copy, progressive disclosure and consistent colors reduce noise without hiding financial meaning, freshness or errors. Text-size/light-mode preferences, a compact accessible sidebar and a documented assistant shortcut work across supported layouts (LAZ-75).
- [ ] **Usable classification.** Tag-catalog management and movement corrections are understandable, retain task context and preserve single-tag, deliberate no-tag/reset and internal-status distinctions. Confirmed changes reconcile affected reads without changing bank facts (LAZ-81, LAZ-77).
- [ ] **Guided banking and account control.** Optional onboarding reuses one authorization/selection/first-sync journey. Only confirmed selected accounts are enrolled; new accounts are not silently added. Aliases persist across refresh/relink, deselection preserves history and skipping banking remains valid (LAZ-74).
- [ ] **Actual automatic synchronization.** Provider-supported background updates work without an open browser under documented cadence/cost/rate limits and narrow authority. Leases, versions, backoff and recovery protect ownership and last-good facts; source age is not confused with fetch time (LAZ-89, LAZ-86, LAZ-90, LAZ-87).
- [ ] **Persistent readable assistant.** One minimizable, theme-aligned assistant survives authenticated navigation in memory, respects reading position and collapses references by default. Necessary approval controls remain explicit; chat has no model/provider labels and separate processing disclosure remains available (LAZ-93, LAZ-91, LAZ-92, LAZ-96).
- [ ] **Live voice, not only recorded input.** The selected supported streaming channel has explicit start/submit/discard controls, deliberate interruption, inspectable source/proposal cards, text fallback, privacy/cost limits and recorded response/stop targets. Speech is not retained as a transcript. Voice retains financial grounding and cannot approve or execute by spoken agreement (LAZ-95, LAZ-94).
- [ ] **Recognizable external access.** Connected applications/consent clearly show client identity, capabilities, state and revocation with safe logos/fallbacks. Branding never replaces security facts or expands grants (LAZ-71).
- [ ] **Working deployment.** The agreed Stage C product is deployed and its core workflows verified on an identified build. Access, operation and limitations are documented. The approach is chosen when issue work starts, not prescribed by planning (LAZ-106).
- [ ] **Executed performance testing.** Agreed performance tests have been run, with measured results, findings and limitations recorded. Scope, approach and acceptance criteria are chosen when issue work starts; functional tests or a test plan alone do not satisfy this outcome (LAZ-108).
- [ ] **Usable mock banking provider.** Representative connection, account-selection, synchronization and recovery journeys work with clearly synthetic data and no real bank access, preserving ownership and financial semantics. This is separate from the optional agent banking-action demo (LAZ-107).
- [ ] **Substantially richer seed.** Varied, coherent synthetic financial history and everyday/edge-case scenarios make development, demonstrations and validation meaningful across the agreed workflows. Loading remains repeatable and documented, without unintended changes to real-user data (LAZ-105).

## Verification and review

- [ ] Required child issues meet their own acceptance checks, or a specific exception/scope change is explicitly accepted and reported. Parent rollups alone are not delivery evidence.
- [ ] All four November 11 additions have delivery and acceptance evidence before LAZ-99 closes. They are mandatory gate blockers, not optional candidates; a deferral, skipped check or carryover-risk note does not satisfy them.
- [ ] The [validation scenarios](validation-plan.md) have recorded controlled, real-RPC/database, browser/accessibility and separately authorized external evidence as applicable (LAZ-98, LAZ-100). Two-user/session isolation, selection changes, provider failures, uncertain outcomes and action authority are covered.
- [ ] Live-model/voice, Firebase, current bank-tracking and required client combinations have current results or explicit unresolved dispositions. Skipped/mocked/older-window checks are not labelled live acceptance.
- [ ] Every optional candidate (quotes, synthetic banking-action demo, alerts, WhatsApp) has a delivered/deferred/promoted decision. An unfinished optional item is not a required gate failure; promotion is an explicit scope change (LAZ-73).
- [ ] User/technical/setup guides match delivered behavior; contracts/migrations and generated output are updated where implementation changed them. A complete dated issue extraction preserves actual statuses, ownership and dates.
- [ ] The actual gate record and retrospective identify the reviewed build, participants/source, results, scope changes and limitations. Dependency/security, capacity/performance, operations/images, retention and cost carryovers retain their release implications (LAZ-99).

Broader MCP management, advanced analysis, further real banking integrations, shared
ownership, historical backfill and real money movement are not required by this
scope. The optional banking-action demo remains isolated simulation. Record any
later promotion or deferral rather than rewriting the original planning evidence.

Sprint C closure does not assert product completion. Apply the separate
[product DoD](../product-definition-of-done.md) before claiming a repeatable,
secure, supported release. November 20 remains a tentative planning target, not a
predeclared gate date or result.
