# First-party financial assistant

The assistant-first home is `/asistente`, the default destination after sign-in.
The shell owns one persistent assistant, inline at home and docked beside other
financial pages (a modal on narrow screens outside home).
`?conversacion=<UUID>` explicitly selects saved history. It reads the same financial
services as the dashboard and MCP. It can prepare budget/savings-goal creation,
tag management and individual movement-tag decisions. Preparing changes no
financial data: the user must approve the saved proposal with its card's button.
The model cannot approve or execute. Neither interface moves money, connects banks,
confirms income, changes banking facts or creates automatic classification rules.

The first open loads the assistant once; authenticated navigation/minimization
retains that same instance, selected conversation, draft and text generation.
Reload restores no private browser state: history is read through authenticated
services, and only an explicit deep link selects a saved conversation. Close panel
stops generation, ends voice and clears the in-memory selection/draft; it does not
delete saved history. Delete requires its separate confirmation and never undoes
financial changes. Logout, credential replacement and owner changes clear private
state and invalidate late results.
Outside home, the persistent top-bar **Asistente · ?** control opens that same
instance without covering page actions. It also supplies focus recovery after
route entry. Welcome suggestions only prepare a draft; changes still require
explicit saved-action approval.

Home uses the available viewport for one full-width conversation and its composer.
A single compact monthly strip expands to reveal the month selector and financial
snapshot. It uses the ordinary scoped monthly summary, not model calls, so it
remains available without AI consent or a configured model. **Resumen completo** preserves the
existing dashboard at `/dashboard`; all manual financial pages remain reachable.
Text is the default: typed questions, streamed answers, follow-ups and text-only history.
History opens in a drawer. Privacy, voice availability and deletion are under
**Opciones del asistente** instead of separate toolbar rows. Text proposals and
their exact approval controls stay inline with the answer. **Ver consultas** opens
validated source observations only on request; there is no empty results column
or conversation/results tab switcher. Closing details restores the conversation,
focus and draft. Wide home layouts can keep those requested details beside the
chat; narrow layouts show a closeable detail view. Spending charts reuse the
dashboard's exact distribution policy; widgets never render model-authored HTML
or independently reconstruct financial totals.

Replies anchor at the beginning of the new answer once, not on each token/source/
action update. Deliberate scrolling and restored history are not auto-followed;
the centered down-arrow reveals the latest content without a text-heavy floating
button. Activity updates use quiet text above the input; errors, money and approval
controls retain their emphasis. Today's message timestamps show time only;
messages from other Santiago calendar days retain their date. Source cutoffs keep
their full timestamps. Query details remain
separate from action approval. Proposals are visible in the originating
text reply, not hidden behind optional references. All surfaces use the
workspace theme tokens. Model/provider names appear in the separate processing
consent screen and optional privacy disclosure, not the chat toolbar. The account's
saved decision replaces session checkboxes. Errors and normal assistant identity
use product-level language.

Optional **live bidirectional WebRTC voice** is implemented but disabled by default.
It needs separate API-only `ASSISTANT_VOICE_ENABLED=true`,
`ASSISTANT_VOICE_MODEL` and `ASSISTANT_VOICE_API_KEY`, plus a configured non-demo
text assistant. The [voice contract](assistant-live-voice.md) records provider/API
evidence, privacy, stop/response/browser targets, single-replica/cost bounds and
unverified live gates. Native audio turns use a server-side Realtime control
connection and the same bounded financial tools and lease policy as text, not
transcription → text request → read-aloud. Separate input transcription is unwired
for cost; new voice turns retain sources, proposals and status, not spoken text.
Native output-text metadata is transiently checked for grounding, never streamed
or persisted. Existing transcript records are not deleted. The active native call
keeps audio context; resumed calls restore owned action state, not speech history.
A dedicated stage shows listening,
querying and responding, **Silenciar** and **Terminar voz**. Subtitles are
removed pending redesign. A large central entry promotes voice in empty chats
without bypassing the explicit start disclosure.
The compact **Texto / Voz** segmented switch shares the assistant header with
icon-only history/new/options actions; it adds no separate toolbar row. Its
selected segment uses the neutral surface palette, not a primary-action fill.
On narrow panels the title remains available to assistive technology while the
switch and actions stay on one line. **Texto / Voz** selects separate views.
Voice owns a separate conversation ID; its messages never enter the text
transcript, history list or text-model context.
Ending capture keeps voice proposals and query results available in the voice view,
without showing transcriptions. Returning to text ends capture and restores the
original selected text conversation and draft. Returning to the retained voice view
does not start the microphone; resuming requires the explicit start disclosure again.
Minimize, navigation and hidden tabs end capture, not text history. Audio has no approval
or execution capability. Server-run tools are not a server-enforced restriction
on a modified browser's provider rendering commands; see
the voice contract's explicit rendering and shutdown/recovery limitations.
No live provider call is part of deterministic validation.
Voice failures appear once in a centered accessible problem card with explicit
retry, state-check or text controls. Hourly admission defaults to 3 starts in
production and 12 elsewhere (API override: 1–60); cooldowns gate voice starts only.
Incomplete answers stay unconfirmed without replaying generation or closing a
healthy call. Saved state is refreshed after asynchronous closure. See the voice
contract for typed errors, diagnostics and the 1,024-token response ceiling.

## Provider-neutral configuration

All configuration is **API-only**. Nothing belongs in Angular, persistence or a
committed secret file. The default is closed:

```dotenv
ASSISTANT_PROVIDER=disabled
```

Select `openai`, `anthropic`, `google`, or `openai-compatible`, with an explicit
`ASSISTANT_MODEL`. The first three also require `ASSISTANT_API_KEY`; there is no
default production model or automatic provider fallback. Compatible endpoints
require `ASSISTANT_BASE_URL`; an API key is optional for a local server. HTTPS is
required except explicit loopback HTTP outside production. URL credentials, query
strings and fragments are rejected. Only trusted operators configure endpoints;
there is no browser/model-controlled URL or key selection.

```dotenv
# Example only: choose a model actually supported by your trusted server.
ASSISTANT_PROVIDER=openai-compatible
ASSISTANT_MODEL=your-installed-tool-capable-model
ASSISTANT_BASE_URL=http://127.0.0.1:11434/v1
```

The provider-neutral AI SDK runtime owns tool execution and text streaming; small
adapters select the configured model. Changing provider does not change chat
contracts, persistence, financial services or the UI. Models must support tools
and multi-step responses. Adapter construction tests are not evidence that every
model/compatible endpoint supports this protocol.

`ASSISTANT_PROVIDER=demo` is an explicitly labelled **offline development aid**,
rejected in production. It maps simple keywords to one read and shows the source;
it is not an LLM or a substitute for live-model quality evaluation. Disabled mode
does not send anything to a model. No provider key is included in configuration
responses. Owned history and deletion remain available when generation is disabled.
Existing banking/OAuth/RPC keys are unrelated and must not be reused.

## Account processing consent

Opening the configured non-demo assistant shows a dedicated consent screen when
the decision is missing, refused or no longer matches the processing policy.
**Permitir y abrir asistente** saves acceptance; **Ahora no** saves refusal and
minimizes a docked panel; at home the financial snapshot and consent/history
entry remain available. Refusal shows the screen again on the next open. Acceptance
survives reload, sign-out and other devices without another checkbox. It never
sends a question, creates a conversation or starts microphone capture by itself.
**Ver historial sin IA** and the header's **Historial** allow reading/deleting saved
chats without new model processing; reopening returns to the consent screen while
permission is absent.

The authenticated `assistant.consent` read never inserts a record. The explicit
`assistant.decideConsent` command accepts only policy key, expected revision and
`accepted`/`refused`. The API binds the policy key to disclosure version, text
provider, model and full compatible base URL. The screen displays its origin,
not credentials or URL secrets. Changed policy returns `unset` with the stored
revision for a fresh explicit decision; API-key rotation alone changes no policy.
Disabled/demo generation requires no consent and creates no preference record.

Migration **032** adds one `assistant.processing_consent` row per internal user,
with forced owner RLS, revision checks and a server-generated decision timestamp.
The shared user write lock serializes competing decisions. An unchanged decision
for the current policy preserves its revision/time; stale revisions conflict.
Only the latest decision is retained, not an immutable consent audit log. Runtime
cannot delete or reassign it. Consent is not stored in browser storage, cookies
or hydration. The additive migration preserves existing financial/chat data and
does not require a seed or reset.

Each new text request and voice admission checks current accepted consent on the
server before history claims or provider work. Missing/refused/unavailable consent
fails closed. Configuration and history/create/delete remain accessible. Ordinary
reopening rechecks permission without recreating an already-authorized composer,
selection or opened query details; new sends wait for that read. Failed/uncertain
saves require an explicit **Comprobar decisión guardada** read, never an automatic
mutation replay. An older or ordinary reopening read cannot clear that uncertainty.

**Opciones del asistente → Privacidad y consentimiento → Retirar consentimiento**
immediately stops local voice/text and invalidates deferred conversation startup,
even if the save is uncertain. A failed
withdrawal leaves local processing blocked until explicit reconciliation/review.
Withdrawal blocks new server admissions after it commits; it does not atomically
cancel previously admitted work, erase provider disclosures or guarantee remote
voice termination on other devices. There is no cross-device cancellation feed.
Voice still requires its own explicit microphone start. Financial action approval
and external MCP grants remain separate permissions.

## Request, history and trust boundaries

Eight authenticated tRPC procedures expose configuration, account consent read/
decision, text conversation summaries, separate owned text/voice reads, creation and deletion.
Four separate `financialActions` procedures
read, approve, revise or cancel saved proposals. `POST /assistant/turns` uses the same
first-party bearer verification, not an MCP OAuth grant or cookies. Its strict
body contains only `{ conversationId, requestId, text }`. Neither browser history,
system messages, tool definitions nor a caller-selected owner are accepted.

The API claims the turn through signed private RPC before invoking a model.
Persistence returns authoritative server history. Recent context contains at most
eight eligible turns / 32,000 characters: completed user/answer pairs and readable
user questions from interrupted/failed turns, never their unfinished answers.
Text context excludes all voice turns, including legacy mixed-history placeholders.
Voice context is local to its separate session. Pending turns are excluded. Tool payloads and
reasoning are not replayed from old turns. Bounded historical action IDs/statuses
allow follow-up questions but do not prove current execution. Historical answers
provide conversational context, not current financial truth; the prompt requires fresh reads for personal
financial claims. Each model step receives system instructions separately from
untrusted questions, merchant descriptions, tag names and tool data.

Every new text/native voice turn also receives a separate **fresh proposal-state
context** from persistence's owned ledger projection, including proposals outside
the last eight completed exchanges. It is bounded to 24 outcomes / 16,000
characters and includes the saved version, exact revised request, status and
applied results. This is not a browser-supplied “approved” flag or an artificial
user message. Only `applied` with results proves the recorded action outcome;
proposed/cancelled/stale/expired and uncertain transport outcomes do not. A receipt
does not prove that the created resource has remained unchanged. The next response
can acknowledge what was actually approved without repeating the proposal; fresh
financial reads still establish current balances and resource state.

The runtime offers the eleven financial reads plus the owned tag catalog, filtered
movement browsing and movement detail. It can prepare or correct proposals and read their
current status, never approve/execute/cancel them. Arguments and
outputs are schema-validated; the authenticated internal UUID is closed over by
the service, never an LLM argument. Domain services retain all money, schedule,
calendar, eligibility and evidence calculations. Tool results preserve exact CLP
strings, nulls, cutoffs, pagination, review states and coverage.

The policy distinguishes expected/received income from available balances, cash
from credit-card debt, a declared savings target from measured allocations,
partial-month comparisons from full months, and purchase-attributed recoveries
from income. Overlapping budgets/goals and evidence pages are not additive.
Unavailable or oversized evidence is explicit, never an invented zero.
Text and voice use neutral Spanish without Chilean slang or a deliberate regional
accent. Santiago dates and CLP remain the financial calendar/currency context.

Each source has an internal `F1`–`F8` identifier, tool, status, query timestamp,
optional requested month, original bounded JSON and an allowlisted internal section
link. Every source has a `recordId`: an owned record UUID after a successful detail
read, otherwise null. Every turn has an `actions` array, including when empty.
These are required current shapes, not compatibility defaults for earlier
development histories. Failed or foreign reads cannot supply target metadata.
Query time is not bank freshness.

Answers use natural prose, without inline source codes, reference lists or JSON.
The UI shows references separately as financial cards. Available evidence, a
validated proposal or an observed receipt is required for numeric answers;
invented/unavailable citations and incomplete model finishes fail the turn.
A narrow preparation-claim backstop also rejects affirmative “preparé una propuesta”
claims when no saved request was prepared, revised or observed. A tag lookup alone
does not prepare a request. Empty action context explicitly reports that no request
exists; status reads reveal an existing card instead of inventing a proposals page.
This pattern check is not general semantic verification and cannot retract native
audio already spoken before validation.
**These checks do not verify every statement or
calculation.** A model can still misuse valid evidence; reference cards and the
incomplete-answer warning remain visible.

## Confirmed actions and independent MCP delegation

`preparar_accion_financiera` accepts `{ action }` with a typed, bounded command.
Missing or ambiguous amounts, periods, dates and tag selections require clarification;
owned reads supply real IDs. Every budget/goal requires at least one existing or
new tag; the model's JSON schema exposes nonempty alternatives, not only a runtime
refinement. No-color is a tag choice, never permission for a tagless objective.
Budget/goal proposals may include up to five new tags.
The assistant asks one missing detail at a time, including the color of a new tag
or an explicit no-color choice. It presents **one request at a time**: "Preparé la
solicitud… Puedes aceptarla en la tarjeta o decirme qué corregir", rather than
claiming it cannot create supported resources. A pending request blocks another
new request; previous requests remain accessible instead of being replaced.
Those tags and the objective commit together; existing active names are reused
without changing their color. Bulk tagging, automatic rules, editing objectives,
income confirmation and banking operations are outside this action slice.

Cards show exact fields, current decisions, impact notes and **Approve / Edit /
Cancel** controls. Conversational “yes” is not approval. Approval sends only the
saved ID/version and requires a completed saved turn in an available owned chat.
Failed/interrupted generations cannot authorize proposals. Editing stores a new
version and requires fresh approval. Each revision expires after 15 minutes;
stale/expired proposals must be reviewed again. At most four proposals belong to
one stored turn; current generation prepares at most one new request per turn.
`corregir_propuesta_financiera` accepts the same saved ID, current version and full
corrected request. Text corrects requests in its text conversation; voice corrects
requests in its separate voice session. Both also support manual **Editar**.
Correction changes only a pending proposal, not finance, and cannot change action
kind, cross conversations or revise an applied/cancelled request.
Unchanged fields/colors survive corrections. Manual **Editar** supports dependent
tag colors too. Both paths require accepting the new exact version. Active voice
sessions receive confirmed manual outcomes in server instructions immediately;
text refreshes them at the next exchange. Neither path treats spoken agreement as
acceptance or generates another proposal after a confirmed receipt.

Tag colors appear as swatches, not hexadecimal text. Editing uses a native color
picker and an explicit no-color choice; exact hexadecimal values remain internal
to the saved request. Reused active tags preview their existing color unchanged.

Persistence rechecks ownership, expiry, factual fingerprints and the API's current
schedule policy under the common user write lock. Changed tag metadata, archival,
manual decisions, provider facts or removed movements cannot be silently overwritten.
A stale proposal makes no financial change. Tagging creates a manual decision,
including deliberate no-tag; reset separately returns a movement to unreviewed.

Existing named repositories execute the command and save the receipt in one scoped
transaction, including dependent tags and decision events. Database/output-validation
failures roll back together. Duplicate approvals return the same receipt. Cancel
after a committed approval reports the applied outcome, not an undo. Ambiguous
responses require an explicit status read; the UI never automatically retries a
mutation. Approval makes no additional model call. `consultar_estado_accion` is
restricted to the current conversation, and only `applied` proves execution.
Confirmed receipts also appear in the originating reply and survive reloading
that conversation. Both modes get authoritative outcomes from their own
conversation on their next exchange, including user-edited approvals. There is no speculative
spoken success notification or automatic replay after an uncertain approval.

Migration **029** adds owner-scoped `assistant.action`, independently of chat JSON.
It retains immutable ownership/origin/idempotency metadata, normalized commands,
bounded context, versions and results. Runtime cannot delete records or rewrite
finalized applied/cancelled records. Deleting chat nulls its FK without deleting
receipts or undoing finance. Availability/cleanup of chat is not receipt retention:
there is no automatic action purge, and storage is capped at 10,000 records per
owner. Define operator retention/account-deletion policy before public rollout.

MCP shares the bounded executor and receipts, not the chat approval workflow.
Existing `finance:read` grants stay read-only. Optional write scopes default off
at consent and are checked against both token and stored grant; execution rechecks
the grant under a row lock. A budget/goal with new tags also needs tag-write
permission. Direct requests require a stable request UUID; reuse with another
payload/client grant conflicts. Existing-record changes require the fingerprint
from `previsualizar_accion_financiera`. This pins selection, not human approval:
the external host controls its own confirmation UX. See [MCP permissions](mcp-authorization.md).

## Dedicated schema and bounded persistence

Migration **028** creates `assistant.conversation`, separate from `identity` and
`finance`. It references the immutable internal user and forces owner RLS.
Runtime has schema USAGE but not CREATE, and can update only title, turns, lease
and update time—not ID, owner, mode, creation time or expiry. Bootstrap and OAuth-purpose
contexts have no access. Conversation deletion changes no financial data.

Creation and turn claims share the existing short per-user advisory transaction
lock. At most ten unexpired text conversations and 100 retained voice conversations
exist per owner, and only one answer can hold an active lease across that owner's
conversations. Each conversation
permits up to 24 questions, with an additional cumulative byte budget that can
require an earlier new conversation. Nonces are unique within a conversation:
same nonce/question returns the stored turn without another model call; changed
text conflicts. There is no automatic generation replay.

Migration **033** adds immutable `text`/`voice` mode (default `text`) and an
owner/mode/update-time index. It backfills nonempty voice-only records using stored
voice markers/lease questions, without rewriting or deleting transcripts. Empty
and mixed records remain text; public text reads/context hide their voice turns.
Public text reads reject voice IDs and the separate `assistant.voiceConversation`
read rejects text IDs. Turn admission checks the persisted mode before replay or
lease creation. Retention and independent action receipts are unchanged. Apply the
additive migration before using the rebuilt API/persistence; no seed/reset is needed.

A claim commits a pending turn and a 90-second lease. Model/network work happens
outside SQL. Completion is a separate transaction and must match the current
lease, pending turn, question and creation time. Late completions cannot overwrite
a newer run. Expired pending leases read as interrupted and are normalized when a
new turn is claimed. A failed finish is an uncertain outcome, not success.

Conversation availability ends 30 days after creation and is not extended by
activity. Explicit deletion removes the row. Creating another conversation deletes
that owner's expired rows. **There is no periodic global purge job**, so inactivity
can leave expired rows physically stored until owner cleanup/operator retention
maintenance. Do not advertise guaranteed physical deletion at day 30. Backups,
database encryption, operator access and provider retention need separate policy.
The migration deliberately refuses destructive rollback; use an explicit recovery
and retention plan instead of silently deleting chat history.

## Streaming, cancellation and limits

NDJSON events are `turn`, `status`, `source`, `action`, `action_updated`, `delta`,
`done` and sanitized `error`. `action_updated` revises an existing conversation
request without reassigning it to the correcting turn or duplicating its controls.
Only a non-pending `done` confirms persistence. The client validates event order,
UTF-8, matching nonce/question, response bytes and output length. A closed stream
without confirmation offers an explicit history read, never an automatic resend.
Responses are private/no-store, with buffering disabled where supported. Proxies
must allow incremental flushing; neither HTTP disconnect nor Stop proves rollback.

The persistent shell-owned panel owns accepted-credential, selection and component lifetimes. Logout,
token/owner replacement, conversation replacement or destruction abort obsolete
work; late events cannot update another conversation/session. Obsolete 401s cannot
expire newer credentials. Stop aborts generation and reconciles saved history.
Pending/ambiguous states block a new question until reconciled. Duplicate sends
are suppressed across conversation creation and navigation too. History, messages,
sources and drafts never enter browser storage, cookies or protected hydration.

| Budget | Current bound |
| --- | --- |
| Question / answer | 2,000 / 16,000 characters |
| Model steps / read calls | 6 / 8 per turn |
| Proposal operations / new requests / dependent new tags | 4 per turn / 1 at a time / 5 per objective; 15-minute expiry per revision |
| Model output | 3,000 tokens per step |
| Read evidence JSON | 24,000 bytes each, 64,000 bytes total |
| Recent context | 8 eligible turns, 32,000 characters; unfinished answers excluded |
| Generation | 60s SDK total; 20s chunk / 15s tool timeout; 65s HTTP signal |
| Parallel runs | 8 per API process; 1 leased run per owner across replicas |
| Conversation JSON | Database maximum 786,432 bytes; new turn refused above 500,000 existing bytes |
| Model retries / SDK telemetry | Disabled |
| Action JSON / owner storage | 65,536 combined payload bytes / 10,000 records |

Timeout/cancellation stops further tools and answer adoption. Already-running
financial reads/proposal preparation may finish; neither changes finance. Interrupted
text, sources and proposals are saved if the lease/transport still permit completion. Rate/cost
protection is bounded concurrency, not a daily token quota, distributed global
admission policy or protection against an unlimited sequence of authenticated
requests. Production exposure needs the corresponding operational controls.

Markdown permits text formatting but escapes model HTML and strips active links
and images. Angular still sanitizes generated markup; no bypass API is used.
Only trusted reference/action cards create internal links. Copy/retry preparation and
delete confirmation are explicit. Retry prepares a new question, not a replay of
a nonce.

### Reference presentation

Cards project schema-validated stored results from all fourteen reads; they are not
model-authored summaries and do not make additional financial requests. They show
formatted CLP amounts, periods, bounded rows and the relevant uncertainty, review,
coverage and cutoff disclosures. No raw JSON panel or source code is displayed.
Model-generated source codes are removed from rendered/copied replies, including
fragmented codes during streaming; original stored evidence remains unchanged.

Cards keep account balances separate instead of summing cash and debt, distinguish
planned/received income, declared targets/measured savings, gross/net spending and
partial/full comparison periods. Totals come directly from services, never from
summing the displayed rows. At most four rows are shown, with an explicit preview
notice when rows or pages remain. Empty, unavailable, oversized and invalid
results remain distinct rather than becoming invented zero amounts.

Each card links to its original app section; validated result IDs can link to
movement, budget or goal detail. Budget purchase evidence retains its month,
revision and both observation cutoffs. Section-level sources have a null target.
Navigation reads current owned data; a card remains an
observation of the saved query, not a guarantee that today's page is unchanged.

## Verification and quality release gate

Focused deterministic checks:

```sh
pnpm --filter api exec vitest run src/assistant src/actions
pnpm --filter persistence exec vitest run src/actions
pnpm --filter ui exec ng test --watch=false --include='**/assistant/**/*.spec.ts'
```

Real signed-RPC tests live in `apps/api/tests/integration/assistant`; the
persistence suite covers schema privileges, two-owner consent isolation/CAS,
concurrent quotas, nonce replay, stale leases, retention, immutable action receipts and rejected late
completions. Run these
only with a fresh disposable database using the
[integration workflow](development-workflow.md#service-starting-integration-checks).
Passing these tests does not establish live model quality.

`assistant-evaluation.integration.spec.ts` runs four synthetic Spanish cases through
the actual SDK tool loop, API stream, domain services and signed persistence: a
reported balance with unknown freshness, untagged spending, full-month planned
versus confirmed income, and equivalent partial-month comparison. Controlled models
use predetermined tool calls/text; their passing results validate the pipeline,
not the model's ability to select tools or write those answers independently.
The same corpus has an explicit opt-in live mode. Configure provider/model/key in
the test process's secure environment and, **only against a fresh disposable test
database**, run:

```sh
ASSISTANT_EVALUATE_LIVE=true pnpm test:integration
```

This incurs provider cost and sends only that suite's synthetic owned fixtures.
It never loads the API's local secret file or chooses a provider automatically.
Without the flag the four live cases skip. Amount/source and keyword assertions
are a screening aid, not a complete semantic judge; review the emitted synthetic
answers manually and extend the corpus before making a release-quality claim.

Before enabling a selected provider/model, evaluate Spanish questions against a
controlled fixture and compare every amount/period to both source JSON and the
normal application read. Cover balances with null/stale dates, current-month
partial comparison, planned versus received income, refunds and untagged spend,
overlapping budgets, measured savings with partial coverage, pagination, missing
data, tool failure, unsupported writes/predictions, prompt injection in questions
and merchant data, follow-up references, truncation and cancellation. Require no
foreign-owner data or secret disclosure, unsupported success claims or invented
amounts; record provider/model/date and failures separately from fixture results.
Never use real customer data as a convenient evaluation fixture.

No live model request was made during the verification recorded below.
Offline demonstration, scripted SDK models and deterministic grounding fixtures
are not evidence of production model accuracy. Provider-specific quality,
retention/cost controls and live endpoint interoperability remain release gates.

### Initial local verification — 2026-11-09

These results cover the initial assistant baseline, before the reference-card
presentation update.

| Check | Observed result |
| --- | --- |
| Build, backend typecheck, architecture and RPC drift | Passed; public/private inventories 74/87 |
| API unit suite | 326 passed, including 14 assistant configuration/SDK cases |
| API integration through real signed persistence | 148 passed; 4 live-model cases and 1 live-Firebase case skipped |
| Assistant integration/evaluation subset after cancellation hardening | 16 passed; 4 opt-in live-model cases skipped |
| UI suite | 384 passed, including 21 assistant cases |
| Persistence unit / PostgreSQL suites | 63 / 35 passed |
| Disposable 027 → 028 upgrade | All 26 prior application tables' synthetic rows unchanged; new assistant table forces RLS |
| Browser smoke | 320/390/768/1440 px without horizontal overflow; keyboard send, source details, history refresh, Stop/reconciliation, foreign-owner rejection and chat-only deletion passed |
| Browser accessibility | No WCAG A/AA scan violations in the tested welcome/reply views; not an exhaustive accessibility certification |

Browser verification used synthetic identities, real restricted persistence and
the labelled offline runtime with artificial chunk delay for cancellation. No
live banking/model request ran. All disposable databases/listeners were cleaned
up. No development database migration, reset, seed or backup was performed.

Build warnings remain for the existing initial bundle/CommonJS dependency and
the assistant page's 6.63 kB style warning (below the unchanged 8 kB error budget).
The production dependency audit is **not clean**: 1 critical, 9 high, 13 moderate
and 2 low advisories across the existing dependency graph. The new SDK paths also
share the already-used flagged Zod version. No unrelated dependency remediation
was included; review the audit and relevant runtime exposure before deployment.

### Reference-card verification — 2026-11-09

| Check | Observed result |
| --- | --- |
| Workspace build, backend typecheck, architecture and RPC drift | Passed; public/private inventories remain 74/87 |
| Formatting / lint | Passed; existing 27 lint warnings and 10 informational diagnostics remain |
| API unit suite / focused assistant rerun | 326 / 14 passed |
| Assistant integration/evaluation through real signed persistence | 17 passed; 4 opt-in live-model cases skipped |
| UI suite | 410 passed, including 47 assistant cases |
| Browser reference cards | All eleven reads, separate prose/cards, large exact amounts, four-row previews and empty/unavailable/limited/older-shape fallbacks checked |
| Browser navigation | Original section, movement, goal and revision/month/cutoff-pinned budget evidence links passed |
| Browser compatibility | Saved legacy replies, fragmented streamed codes, clean clipboard text and history reload passed |
| Browser layout / accessibility | 320/390/768/1440 px without document/card horizontal overflow; no WCAG A/AA scan violations in the tested welcome/reply/reference views |

The browser used synthetic owned data, real restricted persistence, an offline
runtime and explicit stored fallback fixtures. Stop/reconciliation, foreign-owner
isolation and chat-only deletion also passed. All test listeners and freshly
created databases were cleaned up. No live model/bank request, local key/config
change, development-data modification or backup was part of this update.

This presentation update needs no new database migration. The earlier persistence
unit/PostgreSQL results above were not rerun for it. Existing bundle/CommonJS/style
and Vite configuration warnings remain; neither deterministic tests nor browser
scans establish live-model quality or an exhaustive accessibility certification.

### Confirmed-action verification — 2026-11-09

| Check | Observed result |
| --- | --- |
| Workspace build, backend typecheck, architecture and RPC drift | Passed; public/private inventories 78/94 |
| Formatting / lint | Passed; existing 27 warnings and 10 informational diagnostics remain |
| API unit / full signed-RPC integration | 332 / 159 passed; 4 live-model cases and 1 live-Firebase case skipped |
| Persistence unit / PostgreSQL integration | 69 / 36 passed, including owner/purpose isolation, immutable receipts and command-selection binding |
| UI suite | 428 passed across 55 files; an initial parallel-load run timed out, then the complete isolated rerun passed |
| Controlled AI SDK loop | Object-root proposal preparation and current-status reads passed; approval/execution tools and forged owner/approval fields rejected |
| MCP OAuth / official SDK | All 16 tools discoverable; partial consent, default read-only access, explicit scope enforcement, stable-UUID replay and preview fingerprints verified |
| Disposable 028 → 029 upgrade | All 27 previous application tables' rows/grants/RLS unchanged, including synthetic bank credentials/checkpoints and read-only MCP grants; destructive downgrade refused atomically |
| Browser actions | All seven action kinds; edited-version approval, duplicate clicks, stale facts, expiry/revision, cancellation and result navigation passed |
| Browser uncertain outcomes | Intentionally lost an approval response after commit; explicit status read recovered the applied receipt without another mutation |
| Browser retention / regressions | Chat deletion retained financial changes/receipts; balances unchanged; reference navigation, legacy copying, Stop and foreign-owner isolation passed |
| Browser layout / accessibility | 320/390/768/1440 px without document/card horizontal overflow; no WCAG A/AA axe violations in the tested action/editor/reference views; no page errors |

The browser used synthetic owners, real signed RPC/restricted PostgreSQL and a
deterministic offline proposal fixture, not a live model. Test databases/listeners
were cleaned up. No development-data migration, reset, seed, backup, credential
change, live bank request or model-key use was performed. Migration 029 remains
an explicit deployment decision, not an automatic development upgrade.

Existing bundle/CommonJS/style and Vite warnings remain, as does the non-clean
dependency audit recorded above. Deterministic action fixtures do not establish
live-model tool selection/quality, hosted MCP-client write compatibility, load
performance or complete accessibility. Those release gates remain separate.

### Clean development baseline and proposal-storage fix — 2026-11-09

The earlier verification records describe earlier development iterations. The
current unreleased baseline requires explicit `actions` arrays and nullable
`recordId` fields, with no missing-field history compatibility. Conversation reads
use ledger state directly rather than inventing cancellation for a missing record.
Migration 027 creates the final MCP scope constraint; 029 only creates the action
ledger, without an older-constraint upgrade path. Safety checks for approval,
ownership, concurrency, expiry and durable receipts remain unchanged.

A proposal-saving failure was traced to the selected running development database
remaining at 028 without `assistant.action`. After explicit authorization, that
database was rebuilt with all 29 migrations. Only mock-login identity and shared
provider catalogs were initialized; financial data, links, chat and MCP grants
start empty. Existing credentials/configuration were unchanged and no backup or
provider/model request was made.

The `comida`/celeste case now has a controlled SDK integration test covering catalog
read, saved proposal, explicit approval and the resulting tag. A separate smoke
check used the running signed private-RPC service and rebuilt database to verify
preparation, approval and duplicate approval under an isolated temporary owner;
that fixture was removed afterward. Mock login and empty-account reads passed.

Verification: 333 API unit, 160 API integration, 69 persistence unit, 36 PostgreSQL
and 428 UI tests passed. The four live-model cases and one live-Firebase case were
skipped. Build/typecheck, architecture, RPC drift and formatting/lint passed with
the previously disclosed warnings. Responsive browser action/reference checks and
tested WCAG A/AA scans passed without page errors. This does not validate a live
model's tool selection or hosted-client write behavior.

### Visual tag-color verification — 2026-11-09

All 432 UI tests and the production UI build passed after replacing displayed hex
codes with color swatches. Browser checks verified the native color picker, exact
color persistence, tag-list navigation and responsive action/reference layouts.
The tested WCAG A/AA scans reported no violations, with no page or cleanup errors.
Formatting/lint and architecture checks passed with the previously disclosed
warnings. No live model or bank request was made.

### Persistent assistant and controlled voice validation — 2026-11-11

This records an earlier adapter. The current voice contract above supersedes its
transcript collection and read-aloud behavior; the evidence/counts below are historical.

The following records the assistant branch before the other Stage C features were
integrated. The [combined delivery record](../planning/stage-c/experience-delivery.md)
owns final integrated test counts, browser evidence and RPC inventories.

The shell now retains one deferred-loaded assistant instance across authenticated
navigation. Controlled UI coverage checks real route navigation without remount/
refetch/resend, in-flight minimize/reopen, focus return, narrow-screen inertness,
owner clearing, close-during-create races, one-time reply anchoring, stable native
reference expansion and separate pre-processing acknowledgement. Account references
retain supplied paused/disconnected tracking metadata as last-known facts.

The WebRTC adapter is covered with controlled media/transport objects: duplex
track negotiation, explicit microphone start/mute/end, barge-in cancellation and
buffer clearing, transcript deduplication/late-event rejection, denied permissions,
late permission cleanup, device/network/hidden-tab teardown, playback recovery and
idle timeout. API tests check origin/owned-history admission, concurrency/start/
duration bounds, server-only keys, no automatic provider responses or financial
tools, owner-bound hangup, late initialization cleanup and sanitized failures.
Actual HTTP guard tests reject anonymous and forged owner/configuration requests.
Spoken agreement reaches only the ordinary question path, never financial approval.

Validation: 451 UI tests, 339 API unit tests and 2 isolated voice HTTP integration
tests passed. Workspace build/typecheck, formatting/lint, architecture and RPC drift
checks passed. The branch adds no migrations or RPC procedures (78 public / 94
private); the voice bridge uses separately authenticated HTTP schemas. Existing
27 lint warnings/10 informational diagnostics and initial-bundle/CommonJS/style
budget warnings remain; budgets were not raised. The assistant is deferred once
to avoid pulling its renderer/contracts into the initial bundle.

No real database, Firebase, provider key, microphone/device, paid model session or
real-browser accessibility/layout check was used for this update. The browser
matrix, audio/text fidelity, remote hangup and measured response/stop latency/cost
remain **unverified live gates**, not implied by mocked media or passing builds.
Voice stays disabled by default, single-replica only, and needs separate live/cost
authorization plus dedicated project spend controls before enabling. No customer
financial context was disclosed, and no environment file or development database was changed.

### Independent-review race fixes — 2026-11-11

The voice startup lifetime now begins before awaiting conversation creation.
Controlled regressions cover Cancel, acknowledgement withdrawal, navigation,
minimize/reopen, hidden tabs, owner removal and destruction during that deferred
write, plus an accepted-start control. None of the cancelled paths requests a
microphone. The same signal also invalidates permission/transport setup in the
media client; a late permission result is stopped without adopting its tracks.

Provider shutdown now enters a draining state, rejects new starts, retains in-flight
initialization leases and terminates late remote call IDs. Drain waiting is bounded
to 20 seconds with at most three five-second hangup attempts per session/generation.
Unconfirmed remote IDs are retained in memory with an operator warning rather than
silently erased. Tests cover initialization/shutdown races, failed hangup and later
recovery, and a provider response arriving after the drain deadline. Redirects are
rejected and SDP decoding cancels the stream beyond 64,000 bytes.

Asynchronous voice transcripts use bounded pending items and speech-start ordering.
Out-of-order completions are retained immediately in a memory-only review list;
blocked/interrupted delivery offers explicit draft preparation after checking
history, not silent dropping or replay. Mute/end invalidate pending delivery and
late events. Owner/conversation changes and Close clear retained transcripts.

The voice contract now explicitly distinguishes normal-client grounded read-aloud
behavior from server authority: a modified own browser can control its provider
data channel and request ungrounded audio/override output settings. It receives no
first-party financial execution authority. Prompt interpolation is not a fidelity
guarantee; the saved written reply and independently validated exact approval remain
authoritative. Memory-only admission/recovery is not a crash-durable or hard-cost
budget. Shutdown failures/process exit may still require provider lifetime/project
spend controls; no stronger provider-side rendering permission is claimed.

After these fixes, 463 full UI tests, 343 API unit tests and both isolated voice
HTTP tests passed. Workspace build/typecheck, formatting/lint, architecture and
RPC drift checks passed with the previously disclosed warnings. No live provider,
browser microphone, real database or new browser/device/latency/cost validation
was authorized or performed. Voice remains disabled by default.
