# User Journeys

This is a **living, incremental document**. It starts with the journeys needed to validate the financial core and grows as each stage of the [product vision](product-vision.md#development-sequence-and-decision-gates) begins. The [product requirements](product-requirements.md) specify expected behavior; the journeys are not an exhaustive description of the finished product or a commitment to design every future feature upfront.

Each journey describes a user's situation, needed experience and observable outcome. Stage A checks retain the financial-model gate's scope. Stage B journeys below reflect its [2026-11-09 development closure](../planning/stage-b/closure.md), including explicit validation exceptions; the [closure snapshot](../planning/snapshots/backlog-2026-11-09.md) records those workstreams. Stage C journeys now describe the [selected plan](../planning/stage-c/planning.md), not delivered capabilities. Revise assumptions explicitly when financial meaning changes.

## Stage A - Core financial understanding

### J1 - Understand my account balances

**Situation:** I have checking, savings and credit-card accounts. I want to know what is available now without confusing a card balance, recorded income or a stale balance with cash I can spend.

**Journey:** Open the overview, inspect each account's balance and type, and compare the balance with recent movements. If freshness or the meaning of a balance is uncertain, the system says so rather than inventing an available-to-spend total.

**Observable outcome:** The amounts can be explained per account, remain scoped to the signed-in user, and reconcile with the representative demo history. A month's recorded income is not presented as current available cash.

**Stage A check:** Reconcile checking, savings and credit-card examples and decide how balance freshness and card liability are expressed. See the account/transaction semantics review LAZ-17 in the [Stage A closure record](../planning/stage-a/closure.md).

### J2 - Understand actual spending without double-counting money movements

**Situation:** I want to know how much I spent this month and whether it is more than the comparable part of last month. I have transferred money between my accounts and paid a credit-card bill.

**Journey:** View monthly spending and the comparison; inspect transactions and tag breakdowns when something seems surprising.

**Observable outcome:** Internal transfers and payments that merely move money between my own accounts do not inflate spending or income. Debit spending is counted once in the overall total. Each movement has at most one tag, so tagged spending groups are exclusive; untagged spending stays in the overall total. A partial month is compared with a comparable prior period, not a full month.

**Stage A check:** Use transfer, card-payment, tagged and untagged examples to validate the rules. See LAZ-17 and the single-tag classification decision in LAZ-23 in the [Stage A closure record](../planning/stage-a/closure.md).

### J3 - Know how I am doing against a spending budget

**Situation:** I set a grocery spending limit and want to see what has been spent, what remains, and which movements count during its period.

**Journey:** Inspect the budget alongside the period and relevant spending. Check whether the result still makes sense when a budget selects several tags or a movement has no tag.

**Observable outcome:** Spent and remaining amounts can be traced to eligible user-owned movements and a clearly defined period. Each eligible movement counts once per budget when its single tag matches any of the budget's selected tags; excluded internal movements do not consume the limit. Where untagged spending cannot be attributed, the presentation does not imply complete category coverage.

**Stage A check:** Exercise representative monthly and recurring-budget scenarios, and identify any minimum classification or budget workflow needed to make the result trustworthy. See LAZ-15 and LAZ-17 in the [Stage A closure record](../planning/stage-a/closure.md).

### J4 - Distinguish a savings target from a spending limit

**Situation:** I have a savings goal and a spending budget. I want to know whether I have made progress toward the savings goal, rather than seeing a misleading figure based only on tagged spending.

**Journey:** Inspect the goal, its target and any progress or contribution information. Compare it with a spending budget without treating them as the same measure.

**Observable outcome:** The system distinguishes a target from measured contributions; it only shows quantified savings progress after defining and substantiating what counts as a contribution. A transfer or tag alone is not assumed to be a contribution without an agreed rule. If no reliable progress can be measured yet, the system shows the goal without an invented percentage.

**Stage A check:** Decide contribution semantics and objective period/recurrence behavior against representative examples. See LAZ-16 in the [Stage A closure record](../planning/stage-a/closure.md).

### J5 - Define what I expect to earn and identify what I received

**Situation:** I have a fixed salary, variable commissions, or irregular freelance payments. I want to declare when and how much I expect to be paid while keeping that plan distinct from actual deposits.

**Journey:** Define owned income sources and their schedules, add dated expectations for irregular work, and explicitly attribute an existing credit transaction to a source. Compare expected payments with received income and inspect unclassified credits.

**Observable outcome:** Regular timing and amount variability are independent. Every-two-weeks and twice-monthly schedules use their actual calendar dates. Estimated and unknown amounts are explicit. A late or different-amount receipt retains its booked facts. Refunds and internal transfers are not silently treated as earnings, and declarations never change account balances.

**Stage A check:** Demonstrate the source, expectation, receipt, ownership, and period scenarios from LAZ-25 in the [Stage A closure record](../planning/stage-a/closure.md) through the backend API and read-only MCP tool.

## Stage B - Connected financial workflows

### J6 - Access my own financial workspace

**Situation:** I want to sign in, return to my workspace or connect another supported sign-in method without changing who owns my records.

**Journey:** Use Google or verified email/password through Firebase; restore or end the browser session; explicitly link supported credentials from the security page.

**Observable outcome:** The backend maps the verified subject to one internal owner. An account/token change cannot adopt another session's late results. Only public content is prerendered; private pages use browser-owned verified sessions. Email equality does not merge users. **Evidence:** LAZ-29 and its children; the closure retains rigorous live-Firebase acceptance as a separate check.

### J7 - Manage and trace my financial information

**Situation:** I want to organize movements and plans, then understand why a budget, income or savings figure changed.

**Journey:** Browse/filter history, inspect a movement, correct its tag/internal classification, manage budgets/goals and income plans, confirm eligible receipts, and follow reported totals into contributing records. Optional onboarding can be skipped or resumed without blocking normal management.

**Observable outcome:** Owned changes persist after reload without altering booked amounts or reported balances. Gross spending, purchase-attributed recoveries, planned/received income and signed savings allocations retain their distinct meanings. Revision/period/cutoff context and paginated evidence explain the results; displayed page rows are not substituted for complete totals. **Evidence:** LAZ-31/LAZ-32–LAZ-42 and LAZ-30/LAZ-24/LAZ-60–LAZ-70.

### J8 - Connect my bank and understand synchronization

**Situation:** I want stored balances and movements without mistaking successful authorization or an old snapshot for fresh bank data.

**Journey:** Explicitly link through the hosted Widget, import/refresh the available snapshot, inspect source freshness and failures, relink the same identity or disconnect. Read balances in Cuentas and connection/sync state in Conexiones bancarias.

**Observable outcome:** Stable identifiers prevent duplicates; refresh preserves manual decisions and last-good facts on failure. Tracking starts on the original first-link day in Santiago without automatic earlier backfill. Empty imported history does not erase an independent reported balance. Access checks/status/navigation do not import or force a new bank refresh. **Evidence:** LAZ-28/LAZ-47–LAZ-51 and LAZ-62; current-policy/provider validation is distinguished from earlier sandbox results.

### J9 - Ask our own text assistant

**Situation:** I want an explanation of balances, spending, budgets, savings or expected/received income in Spanish.

**Journey:** Ask a question, continue within bounded saved history, inspect separate financial references, follow trusted record/section links, stop a response or explicitly reload history after an uncertain stream outcome.

**Observable outcome:** The agent uses the same owned services as the UI and MCP, preserves periods, uncertainty and evidence, and cannot select another owner. A forecast or incomplete-data request does not become an invented fact. Provider/model configuration is disclosed and credentials remain server-side. **Evidence:** LAZ-26/LAZ-56–LAZ-59; controlled evaluation validates the pipeline, not independent live-model answer quality.

### J10 - Review an exact proposed change

**Situation:** I want help creating a budget/goal, managing a tag or changing one movement's tag, without authorizing a model to act on conversation alone.

**Journey:** Review a saved action card, inspect exact fields and actual tag colors, edit/cancel it or explicitly approve the current version. If confirmation is lost, read its status before another write.

**Observable outcome:** Only saved-version approval executes; edits invalidate earlier approval and stale/expired proposals make no financial change. Dependent tags and the financial command commit with a durable receipt. Duplicate approval does not duplicate the result; stopping/deleting chat does not undo it. **Evidence:** PR #36 and the [action lifecycle](../technical/financial-assistant.md#confirmed-actions-and-independent-mcp-delegation), recorded as an explicit Stage B scope extension.

### J11 - Delegate bounded access to an external MCP client

**Situation:** I want a compatible external assistant to use my permitted financial capabilities without sharing my first-party login token or granting every write.

**Journey:** Review the client/callback and requested permissions, leave optional writes off or select only needed capabilities, use supported tools, inspect the grant and revoke it when no longer needed.

**Observable outcome:** Reads and changes remain owner-scoped; a read-only grant never silently gains writes. Current bounded direct changes need their specific OAuth scopes, stable request IDs and current preview fingerprints for existing records, not chat approval. Revocation rejects subsequent access without undoing committed finance. **Evidence:** LAZ-27/LAZ-52–LAZ-55 and PR #36; required external-client write combinations still need dedicated validation.

## Stage C - Selected everyday experience and live voice

Selected on **2026-11-09** after the Stage B review. The
[scope record](../planning/stage-c/planning.md) and
[validation plan](../planning/stage-c/validation-plan.md) distinguish required
outcomes from optional candidates; none is presented as already implemented.

### J12 - Connect once and control tracked accounts

**Situation:** I want bank data without repeated technical setup or manual refresh.

**Journey:** Optionally connect from onboarding, authorize Fintoc, choose the
accounts to track and confirm first synchronization/automatic updates. See source
age and recovery when needed; set/change an account's personal alias.

**Observable outcome:** Skipping or cancelling banking remains valid setup.
Authorization alone does not enroll every account, and new accounts are not
silently added. Supported background updates work without an open browser;
deselection/relink preserves history, aliases and owned decisions. A new fetch
does not pretend that a stale bank source is fresh. **Issues:** LAZ-74 and children.

### J13 - Organize and classify without confusion

**Situation:** Tag management and correcting a movement feel harder than necessary.

**Journey:** Manage the tag catalog separately from assigning a single movement's
tag/no-tag/reset or internal-status choice, retaining the ledger's context.

**Observable outcome:** Concise feedback explains confirmed effects on spending,
budgets and savings without changing booked amounts, dates or bank balances.
Intentional no-tag is not confused with unreviewed classification; errors do not
trigger blind mutation replay. **Issues:** LAZ-81, LAZ-77, LAZ-78.

### J14 - Read and keep the assistant nearby

**Situation:** I want help while exploring the app, without losing my conversation
or being scrolled past the beginning of an answer.

**Journey:** Open/minimize a theme-aligned assistant, navigate and restore it, read
new streamed replies from their beginning and expand references only when needed.

**Observable outcome:** One accepted conversation/draft remains in memory across
authenticated navigation, not browser storage. Deliberate scrolling is respected;
approval cards remain explicit and evidence stays accessible. Chat has no model/
provider labels; separate processing disclosure remains available. Logout/owner
change clears private state. **Issues:** LAZ-93, LAZ-91, LAZ-92, LAZ-96.

### J15 - Continue by live voice

**Situation:** I want to speak naturally with the same grounded financial assistant.

**Journey:** Explicitly start the microphone, speak and interrupt, inspect the
transcript/references, mute/end or return to text.

**Observable outcome:** Visible capture controls and defined session/response/stop
bounds apply on documented supported browsers. Denied permission or an outage
leaves a useful text fallback. Spoken agreement does not approve a financial
proposal; ownership and saved-version approval remain unchanged. **Issues:**
LAZ-95, LAZ-94.

### J16 - Adapt the workspace

**Situation:** I need readable text, my preferred theme and more space for content.

**Journey:** Set text size/light or dark mode, compact the sidebar to icons and
use a discoverable keyboard shortcut to open the assistant.

**Observable outcome:** Meaningful icon labels, contrast, focus and mobile
navigation remain usable. Reload retains only non-sensitive preferences, never
private financial/chat data. **Issues:** LAZ-82, LAZ-84, LAZ-79; shared clarity LAZ-78.

### J17 - Recognize delegated applications

**Situation:** I want to recognize who can access my finances and revoke that access.

**Journey:** Inspect clear connected-app identity, a safe logo/fallback, granted
capabilities and expiry/state, then explicitly revoke if desired.

**Observable outcome:** Client/callback facts and permission choices remain legible;
branding is not verification or extra authority. Empty/error/revoked states are
honest, and subsequent revoked access fails. **Issues:** LAZ-80, LAZ-83.

### J18 - Compare an external quote — optional, highly desirable

Use an available, permitted search/API source to compare a dated price with
relevant owned financial context. Sources, currency, availability and unknown fees
remain explicit; expected income is not available cash. No financial history is
exported to a marketplace and no purchase/payment occurs. Uber/MercadoLibre are
examples to assess, not promised integrations. **Issue:** LAZ-101.

### J19 - Inspect a simulated banking action — optional

Review exact synthetic accounts, amount and currency, explicitly confirm and see a
clearly labelled mock result. The demonstration is isolated from real bank write
credentials, imported facts and user balances, and disabled in production. It does
not grant the assistant real money-movement capability. **Issue:** LAZ-103.

### J20 - Review actionable alerts — optional

Open concise in-app classification or explicitly defined critical budget/goal
items, inspect their reason/freshness and follow a relevant correction/detail
link. Eligibility, critical thresholds and acknowledgement/resolution rules must
be defined. Intentional no-tag and partial savings evidence are not automatically
failures; alert generation changes no financial facts. **Issue:** LAZ-102.

### J21 - Use WhatsApp after explicit binding — optional

Opt in through authenticated account binding, use only documented permitted
capabilities and revoke/unlink access. A phone number or inbound message alone
does not select a financial owner. Provider access/terms, privacy, retention and
cost need validation before promising the channel. **Issue:** LAZ-104.

Broader MCP management remains an identified follow-up, not selected by this
brief. Advanced analysis, additional bank adapters, historical backfill, shared
ownership and real money movement also remain outside the selected scope.

## Using this document

Keep acceptance criteria and implementation work in Linear issues; the [planning snapshot](../planning/snapshots/backlog-2026-11-10-stage-c-planning.md) makes the inventory accessible to reviewers. A journey's implementation, recorded verification and remaining limitations must stay distinguishable. The [Stage A closure](../planning/stage-a/closure.md) captures the financial-model gate, and the [Stage B closure](../planning/stage-b/closure.md) records the connected development increment without asserting product release readiness.

## Stage A user stories

| Journey | User story                                              | Parent decision |
| ------- | ------------------------------------------------------- | --------------- |
| J1      | LAZ-19 — Interpret account balances                     | LAZ-17          |
| J2      | LAZ-21 — Exclude internal movements from spending       | LAZ-17          |
| J2/J3   | LAZ-23 — Classify each transaction with at most one tag | LAZ-17          |
| J3      | LAZ-22 — Trace budget spending                          | LAZ-15          |
| J4      | LAZ-20 — Measure savings-goal progress honestly         | LAZ-16          |
| J5      | LAZ-25 — Define income sources and payment schedules    | LAZ-15          |
