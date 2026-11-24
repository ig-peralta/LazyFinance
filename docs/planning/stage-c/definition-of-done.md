# Stage C — Definition of Done

**Scope selected 2026-11-09 after Stage B's GO to planning.** The
[planning record](planning.md) traces all 18 feedback items and the
[snapshot](../snapshots/backlog-2026-11-10-stage-c-planning.md) records 29 required
issues (5 parents/24 children) plus 5 Optional records at initial selection.
The [November 11 addition](planning.md#required-scope-additions--2026-11-11) adds
four mandatory children; the [November 24 addition](planning.md#required-scope-addition--2026-11-24)
adds security verification: **34 required and 5 Optional records** in total.
**Gate reviewed 2026-11-24: GO for development closure**, against `main` at
`7ae34761`. The marks below record acceptance within the development scope and
the [review's stated limits](closure.md), not a claim of independent live or
production certification.

## Required outcomes

- [x] **Clear and adaptable workspace.** Concise Spanish copy, progressive disclosure and consistent colors reduce noise without hiding financial meaning, freshness or errors. Text-size/light-mode preferences, a compact accessible sidebar and a documented assistant shortcut work across the tested layouts (LAZ-75).
- [x] **Usable classification.** Tag-catalog management and movement corrections retain task context and preserve single-tag, deliberate no-tag/reset and internal-status distinctions. Confirmed changes reconcile affected reads without changing bank facts (LAZ-81, LAZ-77).
- [x] **Guided banking and account control.** Optional onboarding reuses one authorization/selection/first-sync journey. Only confirmed selected accounts are enrolled; new accounts are not silently added. Aliases persist across refresh/relink, deselection preserves history and skipping banking remains valid (LAZ-74).
- [x] **Actual automatic synchronization.** The bounded background path works without an open browser. Leases, versions, backoff and recovery protect ownership and last-good facts; source age is not confused with fetch time. Controlled verification and the maintainer's live confirmation are accepted for the stage; production entitlement, costs and source freshness remain separate (LAZ-89, LAZ-86, LAZ-90, LAZ-87).
- [x] **Persistent readable assistant.** One minimizable, theme-aligned assistant survives authenticated navigation in memory, respects reading position and collapses references by default. Approval stays explicit and separate processing disclosure remains available (LAZ-93, LAZ-91, LAZ-92, LAZ-96).
- [x] **Live voice, not only recorded input.** Opt-in streaming voice includes explicit microphone controls, interruption, transcript and text fallback. The [voice contract](../../technical/assistant-live-voice.md) records the design and limits. Speech cannot approve or execute; the live-session confirmation is accepted within the stage, without a release support matrix (LAZ-95, LAZ-94).
- [x] **Recognizable external access.** Connected applications/consent show client identity, capabilities, state and revocation with safe logos/fallbacks. Branding never replaces security facts or expands grants (LAZ-71).
- [x] **Working deployment.** The [development deployment](closure.md#gate-assessment) has a recorded workflow/build and public endpoint checks. Signed-in core workflows were separately confirmed in the written review (LAZ-106).
- [x] **Executed performance testing.** [Measured results](performance-testing.md) pass the selected larger resource profile. Representative reads on the smaller default profile remain a limitation; this acceptance does not cover deployed capacity (LAZ-108).
- [x] **Usable mock banking provider.** Synthetic connection, account selection, synchronization and recovery use the normal ingestion path without real bank access. This is separate from the deferred agent banking-action demo (LAZ-107).
- [x] **Substantially richer seed.** The repeatable synthetic CLP history supports everyday and edge-case scenarios without modifying another user's data. The owner-only manual fixture and account-scoped simulated bank are distinct (LAZ-105).

## Verification and review

- [x] The [workstream assessment](closure.md#delivered-workstreams) reconciles the required child issues and parent rollups. All four November 11 additions were delivered and accepted, not deferred or counted as carryovers.
- [x] The [security regression record](security-testing.md) shows executed trust-boundary checks (LAZ-109). Dependency findings and deployment security remain release follow-ups.
- [x] The [validation assessment](closure.md#gate-assessment) separates controlled, signed-RPC/database and browser/accessibility results (LAZ-98) from the maintainer's confirmation that the selected live validations were performed (LAZ-100). No per-case live results are inferred, and skipped/mocked/older-window checks are not labelled live acceptance.
- [x] All four [optional candidates](closure.md#optional-outcomes) were deferred from Stage C without promotion or a delivery claim (LAZ-73).
- [x] User/technical/setup guidance distinguishes the delivered development workflows from release requirements. The [dated extraction](../snapshots/backlog-2026-11-24-stage-c-gate.md) preserves actual statuses, ownership and dates.
- [x] The [gate record](closure.md) and [retrospective](retrospective.md) identify the baseline, review source, scope changes and limitations. Dependency/security, capacity, operations/images, retention and cost carryovers retain their release implications (LAZ-99).

Broader MCP management, advanced analysis, further real banking integrations, shared
ownership, historical backfill and real money movement are not required by this
scope. The optional banking-action demo remains isolated simulation. Record any
later promotion or deferral rather than rewriting the original planning evidence.

Sprint C closure does not assert product completion. Apply the separate
[product DoD](../product-definition-of-done.md) before claiming a repeatable,
secure, supported release.
