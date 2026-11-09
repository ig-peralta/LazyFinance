# Sprint B (Stage B) — closure record

- **Stage:** Parallel product tracks; milestone target 2026-11-13.
- **Gate decision:** **GO to Stage C planning**, confirmed by Ignacio Peralta on 2026-11-09.
- **Reviewed baseline:** [`main` at `1cda504`](https://github.com/ig-peralta/LazyFinance/commit/1cda5042a6ecaacca8ce414818c549f85a2f9bd7), merged through [PR #36](https://github.com/ig-peralta/LazyFinance/pull/36).
- **Last Stage B issue completed:** LAZ-26, 2026-11-09 at 12:58:51.898 UTC.
- **Record date:** 2026-11-09; Git/PR evidence, a fresh Linear export and the closure review with Ignacio Peralta.

Stage B closes as a **development increment with accepted limitations**, not as a
production release or certification of every live integration. Its six parent
workstreams and 40 child issues are Done in the
[November 9 snapshot](../snapshots/backlog-2026-11-09.md). That snapshot preserves
the complete project inventory: 19 Stage A issues, 46 Stage B issues and no Stage C
issues. Linear remains the live tracker; this record documents the gate decision.

## Gate assessment

| Gate area | Disposition | Evidence or exception |
| --- | --- | --- |
| Six committed workstreams | Accepted for development closure | Delivered outcomes and public PRs below; all 46 Stage B issues Done |
| Cross-component financial meaning and ownership | Accepted within recorded test scope | Shared services, signed RPC, restricted PostgreSQL/RLS, multi-user fixtures and UI/session checks |
| User-facing flows | Accepted with live-validation exceptions | Management, banking, MCP and chat evidence below; informal development checks are supplementary |
| Scope changes | Accepted and recorded | Dedicated persistence, private CSR/static hosting, additional access methods and bounded action capabilities |
| Verification and limitations | Accepted for continued development | Recorded checks and carryovers below; skipped/live-unverified cases remain unverified |
| Stage C handoff | GO to planning | Broader MCP management identified for follow-up; exact issue selection remains the next planning decision |

The [Stage B DoD](definition-of-done.md) records the stage-level disposition. The
[product DoD](../product-definition-of-done.md) remains a separate release gate.

## Delivered workstreams

| Workstream and issue scope | Delivered outcome | Implementation and verification references |
| --- | --- | --- |
| **Financial core/backend — LAZ-31**, LAZ-32–LAZ-42 | Owned tag management and transaction corrections; filtered cursor history; revisioned budgets and savings targets; purchase-attributed refunds/reimbursements; measured signed savings allocations; paginated evidence backed by complete aggregates | [PR #30](https://github.com/ig-peralta/LazyFinance/pull/30), [PR #31](https://github.com/ig-peralta/LazyFinance/pull/31), [API financial policies](../../../apps/api/README.md), [RPC contracts](../../technical/rpc-contracts.md) |
| **Web application — LAZ-30**, LAZ-24 and LAZ-60–LAZ-70 | Persistent financial-management pages, transaction details/filters, income expectations and receipts, budget/savings evidence, optional onboarding, bank settings and truthful loading/error/freshness states; public prerendering with private CSR and static Nginx hosting | [PR #13](https://github.com/ig-peralta/LazyFinance/pull/13), [PR #32](https://github.com/ig-peralta/LazyFinance/pull/32), [PR #33](https://github.com/ig-peralta/LazyFinance/pull/33), [PR #34](https://github.com/ig-peralta/LazyFinance/pull/34), [UI guide](../../../apps/ui/README.md), [UI lifetimes](../../technical/ui-data-lifecycle.md) |
| **Firebase identity — LAZ-29**, LAZ-43–LAZ-46 | Backend token verification, stable provider/issuer/subject-to-user mapping, browser-owned sessions, Google and email/password access, verification/reset and explicit same-UID credential linking; development mock mode remains isolated | [PRs #16](https://github.com/ig-peralta/LazyFinance/pull/16), [#17](https://github.com/ig-peralta/LazyFinance/pull/17), [#18](https://github.com/ig-peralta/LazyFinance/pull/18), [#19](https://github.com/ig-peralta/LazyFinance/pull/19), [#28](https://github.com/ig-peralta/LazyFinance/pull/28), [identity guide](../../technical/identity.md). Controlled verification passed; rigorous live two-user Firebase acceptance remains a carryover |
| **External MCP authorization — LAZ-27**, LAZ-52–LAZ-55 | Standards-first OAuth discovery/registration, PKCE/resource binding, owner-bound grants, rotating refresh credentials, consent and revocation; official SDK lifecycle verification and an actual local OpenCode read/revocation check | [PR #35](https://github.com/ig-peralta/LazyFinance/pull/35), [authorization and compatibility matrix](../../technical/mcp-authorization.md#compatibility-and-verification-matrix). PR #36 additionally supplies bounded, separately scoped direct writes; broader management coverage remains follow-up work |
| **Provider-neutral banking/Fintoc — LAZ-28**, LAZ-47–LAZ-51 | Neutral normalization and atomic ingestion; owned Widget linking, encrypted credentials, relink/disconnect; explicit import/refresh, stable identities, preserved decisions, durable leases, coalescing/recovery and source-freshness reporting; movement tracking from the original first-link day | [PRs #14](https://github.com/ig-peralta/LazyFinance/pull/14), [#15](https://github.com/ig-peralta/LazyFinance/pull/15), [#33](https://github.com/ig-peralta/LazyFinance/pull/33), [#34](https://github.com/ig-peralta/LazyFinance/pull/34), [connector guide](../../../apps/api/src/banking/README.md), [Fintoc evidence](../../../apps/api/src/banking/fintoc/README.md). Sandbox evidence predates the final tracking policy |
| **First-party assistant — LAZ-26**, LAZ-56–LAZ-59 | Provider-neutral Spanish text-chat pipeline; server-owned bounded history, grounding and financial reference cards; streaming/Stop and reconciliation; readable, versioned approval/edit/cancel cards with durable receipts and visual tag colors | [PR #36](https://github.com/ig-peralta/LazyFinance/pull/36), [assistant implementation/evaluation guide](../../technical/financial-assistant.md). Deterministic SDK/evidence tests passed; live-model answer quality is not established |

## Product and engineering decisions

### One financial core across interfaces

The API owns financial interpretation and calendar policy. Only persistence uses
SQL; short signed contexts, scoped transactions and related-owner RLS protect
authoritative commands. Public/private contracts and generated clients preserve
exact decimal, timestamp and null meanings without cross-app source imports.
[PRs #26–#28](platform-evolution.md) established these boundaries and strengthened
type safety and access methods. The final baseline has **78 public / 94 private
procedures**, **29 migrations**, and **28 application tables**, of which 27 force
RLS; the provider catalog is shared and runtime-read-only.

### Financial meaning before presentation

- Confirmed recoveries reduce spending in the **original purchase period**. Their
  credit-period cash context is separate, and a refund is not silently income.
- Started recurring budget edits take effect next period; revisions and archival
  cutoffs retain meaningful history.
- Savings progress measures signed, tag-selected cash allocations, including
  withdrawals and incomplete-history context. It is not a balance or new wealth.
- Bank balances remain provider-reported facts. Movement tracking begins on the
  connection's original first-link day in Santiago, not a rolling 90-day backfill.
  Day-level provider dates cannot promise an exact-second boundary.

Refund attribution and the bank-tracking boundary were the principal financial
decisions highlighted in this review. Their rules remain owned by the API and
banking guides rather than duplicated in each interface.

### Predictable rendering and explicit operation outcomes

[PR #32](https://github.com/ig-peralta/LazyFinance/pull/32) changed the earlier
private-SSR design to browser-owned private pages, public-only prerendering and
static hosting. The review identified more predictable rendering, shared service
reuse, clear ownership boundaries and maintainable typed contracts as important
benefits. Accepted-credential cancellation prevents obsolete results from being
adopted; cancellation never proves that a committed command was rolled back.

### Bounded actions extend the original read-only scope

The original assistant/MCP issue descriptions specify read-only capabilities.
[PR #36](https://github.com/ig-peralta/LazyFinance/pull/36) extends that baseline
with budget/goal creation, tag management and individual tag/no-tag/reset commands.
This extension is recorded in the final Stage B development scope, not presented
as an unchanged original requirement.

The first-party model can prepare proposals and read status, but cannot approve or
execute them. Explicit card approval submits a saved ID/version; expiry, current
facts and ownership are rechecked. Named domain commands and receipts commit
atomically, and receipts survive chat deletion. Conversational agreement is not
approval.

MCP already supports `previsualizar_accion_financiera` and
`ejecutar_accion_financiera` with independent optional OAuth write consent,
fingerprints and stable request UUIDs. It does not use the first-party chat
approval workflow. **Broader MCP management tools**, beyond this bounded action
union, are the missing coverage identified for Stage C planning. Actual external
client write interoperability is a separate validation gap.

Neither action path moves money, performs banking operations, confirms income or
creates automatic rules. Existing direct UI management capabilities do not imply
equivalent agent/MCP permissions.

## Recorded verification

These are results recorded in the linked delivery evidence, **not test runs made
while writing this closure**. Check counts are not added across historical runs.

| Evidence | Recorded result and boundary |
| --- | --- |
| Final assistant baseline, PR #36 | Build/typecheck, formatting/lint, architecture, RPC drift and whitespace checks passed; 333 API unit, 69 persistence unit and 432 UI tests passed |
| Same implementation's signed-RPC/database verification | 160 API integration and 36 PostgreSQL tests passed; four opt-in live-model cases and one live-Firebase case skipped |
| Final chat/action browser checks | Seven action kinds, revised approvals, stale/expired proposals, duplicate prevention, lost-response reconciliation, retained receipts, reference navigation and exact tag-color persistence; no page errors or detected WCAG A/AA violations in tested views at 320/390/768/1440 px |
| Financial-management delivery, PR #31 | Real signed-RPC/disposable-PostgreSQL runner recorded 256 passed and one live-Firebase skip; persistence recorded 85 passed; financial amounts, periods, revisions, evidence and ownership covered |
| Workspace delivery, PR #32 | Production UI build and recorded static-image/browser checks; later filter follow-up recorded 293 UI tests. Earlier image/browser results retain their stated baseline and are not a final full-stack image certification |
| Banking delivery, PRs #33–#34 | Real hosted sandbox linking/import/refresh/recovery evidence plus controlled RPC/PostgreSQL and UI regressions. Sandbox runs used the former window; the final first-link cutoff was verified with controlled fixtures, not a new live-provider run |
| MCP delivery, PRs #35–#36 | Official SDK 2.4.0/protocol checks for OAuth, isolation and tool schemas; actual local OpenCode 2.2.5 read and post-revocation disconnect. Direct writes have controlled integration coverage, not verified hosted-client write support |
| Informal development checks | Ignacio reported surface-level checks across login/access, financial screens, banking, chat/action cards and an external MCP client. These supplement recorded evidence; they are not a rigorous acceptance campaign or proof of live-model, identity or write interoperability |

Known nonfatal diagnostics remain: 27 lint warnings, 10 informational diagnostics,
initial bundle/CommonJS/style warnings and test-tooling notices. Automated
accessibility scans are not a complete accessibility audit.

## Accepted limitations and carryovers

The gate accepts the following as **nonblocking for Stage C planning**, not as
passed checks or permission for public rollout. Stage C planning must decide
which become selected work and which remain release constraints.

| Area | Remaining work or constraint |
| --- | --- |
| Live assistant quality | Evaluate an explicitly selected provider/model with representative Spanish questions, grounding, failures and manual answer review; deterministic fixtures do not establish model quality |
| Live identity | Complete a current two-user live-Firebase acceptance run, including rejection, refresh/logout and relevant credential flows; the opt-in case was skipped in recorded final runs |
| Current bank-tracking policy | Validate the first-link-day cutoff against the sandbox/provider without treating the older 90-day evidence as coverage of that rule; live-bank consent and production conventions remain separate |
| External-client interoperability | Verify required client/version/deployment combinations, including direct writes, consent, recovery and revocation; local read/SDK evidence is not hosted ChatGPT/Claude write evidence |
| Dependency security | Recorded production audit: 1 critical, 9 high, 13 moderate and 2 low advisories. Assess exposure/remediation before rollout; this review did not run a new audit |
| Performance and capacity | Measure the documented route-latency target and maximum-size ingestion/commit limits; passing functional suites is not load evidence |
| Deployment operations | Verify the exact release images/topology, protected service transport, secrets/key recovery and rotation, backup/restore and monitoring/rate controls |
| Cost, privacy and retention | Define model-cost/admission controls, provider retention and operator/account-deletion policy. Chat expiry is not a global physical-purge guarantee; durable action receipts have no automatic purge |
| Database baseline | The unreleased migrations target a fresh database, including the final scope constraint in 027. No retained-old-constraint/history upgrade bridge is supplied; any reset requires explicit target authorization |

Bank-forced refresh, automatic scheduling/webhooks, optional historical import,
voice, advanced analysis and additional providers remain outside the delivered
Stage B scope. Their absence is not represented as a failed implementation of
the manual snapshot-refresh contract.

## Stage C handoff

The [retrospective](retrospective.md) recommends **smaller coherent reviews** and
**explicit live-validation sessions**. Keep dependent contracts, implementation,
tests and documentation together while avoiding unrelated outcomes in one review.

Broader MCP management is an identified follow-up: define the exact operations,
permission model and acceptance cases before extending the action surface. Voice,
advanced analysis and further providers remain candidates rather than automatic
commitments. The [Stage C guide](../stage-c/README.md) records this handoff; the
snapshot contains **zero Stage C issues** and the November 20 milestone target
remains tentative. No Linear issue, status or milestone was changed to publish
this record.

## Sources

- Linear workspace **LazyFinance**, project **P-LAZ-1 — LazyFinance product development**; complete issue export on 2026-11-09, ending at 15:09:43.935 UTC, including archived items (none returned).
- Stage B milestone's November 2 planning checkpoint and six parent issue descriptions; public Git/PR references above.
- [Stage B DoD](definition-of-done.md), [fresh inventory](../snapshots/backlog-2026-11-09.md), [product requirements](../../product/product-requirements.md) and current [technical index](../../technical/README.md).
- Closure/retrospective decisions confirmed by Ignacio Peralta on 2026-11-09; informal checks are distinguished from recorded execution evidence.
