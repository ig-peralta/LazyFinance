# UI data, browser session and rendering lifetimes

The UI uses native tRPC Promises, Angular signals/resources and page-owned feature
services. This reference explains why the lifetimes matter; the
[UI README](../../apps/ui/README.md) covers app commands, and
[provider-neutral identity](identity.md) covers external subjects and principals.

## Dependency direction and accepted identity

```text
SessionService → AuthApi → RpcClient → AuthCredentials
                                ↑
DashboardPage → feature data services → resources / explicit commands
```

| Module | Owns | Must not own |
| --- | --- | --- |
| `core/auth/auth-credentials.ts` | Accepted principal/token snapshot and its abort lifetime | HTTP, Firebase, cookies or navigation |
| `core/rpc/rpc-client.ts` | Anonymous/candidate/scoped clients, cancellation and transport error policy | Session restoration or router navigation |
| `core/auth/auth-api.ts` | Anonymous config/mock login and candidate `auth.principal` verification | Installing or expiring accepted credentials |
| `core/auth/session.service.ts` | Shared browser restoration/retry, Firebase commands/observer, revision/owner checks and expiry | Financial resource state or rendering-blocking guards |
| `features/*/*.data.ts` | Feature reads, query inputs, explicit commands and confirmed page-local updates | A second catalog of generic endpoint aliases |
| Components / `createTagDecision` | Presentation and component-lifetime command/suggestion state | A global financial response cache |

`AuthCredentials.accept()` stores a frozen principal/token snapshot with a new
`AbortController`. Accepting the identical user/token is a no-op. Replacing a token
(even for the same user), changing users, clearing credentials or destroying its
injector aborts the old lifetime. There is no circular injection from transport
back into `SessionService`.

`RpcClient.authenticatedScope` is a computed value: absent before accepted
verification, otherwise one immutable client/signal pair reused within that
snapshot. It is not recreated for every query, shared across renders, or updated
by a mutable token getter. An anonymous client has no accepted identity;
`verificationClient(token)` verifies a candidate without installing it.

An authenticated 401 can expire only the **exact snapshot** that sent the request.
A late old-token 401, failed candidate verification or stale Firebase callback
cannot clear a newer accepted session. `SessionService` revision checks prevent
obsolete asynchronous restoration/login results from becoming current; Firebase
UID checks additionally reject a completed verification for a no-longer-current
browser user. Logging out clears local state before awaiting Firebase sign-out.

## Firebase commands and observer ordering

Explicit Google/password login, registration, verification and credential linking
are serialized by `SessionService`. They own an abort controller and, for account
commands, capture the expected Firebase UID and accepted internal user UUID.
Component destruction, logout, session expiry and account changes invalidate
obsolete work. Candidate API verification receives the command signal; accepting
a refreshed token does not itself cancel that same owner's linking command.

Firebase ID-token callbacks are deferred while a command owns acceptance. SDK
reauthentication, creation or forced refresh must not independently accept a token
before the command's API/owner checks finish. An unexpected UID change invalidates
the command and clears local access. Logout/expiry suppress subsequent observer
acceptance until another explicit Firebase action; late callbacks cannot simply
restore the signed-out principal.

The non-abortable SDK operation has a separate barrier. A cancelled popup or
creation must settle, and its late user is signed out when still current, before
a new explicit SDK action starts. SDK sign-out is serialized too; cleanup never
signs out a different/newer UID. A failed cleanup leaves local acceptance disabled,
not a claim that Firebase persisted-state clearance succeeded. A fresh page load
still restores Firebase's actual persisted state normally.

Cancelling a signed-in linking command does not sign out an otherwise-current
owner. Firebase may already have changed their credentials: current method status
is refreshed from the same SDK user, without adopting an obsolete API result or
pretending the link was rolled back. The security page scopes pending notices and
errors to its current UID/internal owner and aborts its command signal on teardown.
Passwords/pending OAuth credentials are not put in cookies, transfer state or a
recovery queue. Only a five-minute, owner-bound, single-use Google-link readiness
proof survives between the password confirmation and the popup button.

An unverified password registration deliberately has a Firebase account snapshot
but no accepted application credentials. Verification reloads and
refreshes the token before API acceptance. Browser account metadata is a UI hint,
not evidence that can authorize financial requests. See the complete
[sign-in/linking policy](identity.md#firebase-sign-in-and-credential-linking).

## Three cancellation lifetimes

1. **Application/render injector:** `RpcClient` aborts its work when destroyed.
2. **Accepted credentials:** token replacement/logout aborts old-identity work.
3. **Operation owner:** a resource's `abortSignal` or a component command controller
   ends work when inputs change, the component is destroyed or the operation ends.

The standard tRPC session-policy link composes these signals and prevents aborted
results/errors from being delivered to a new identity. Resource loaders forward
their operation signal; commands forward their component signal. The link uses
tRPC's own observable protocol internally, not an Angular Observable facade or
Promise-to-Observable-to-Promise conversion.

Cancellation stops the client from adopting obsolete results. **It does not prove
the server rolled back a write.** A disconnect can happen after commit. Neither
the transport nor feature commands automatically retry mutations after ambiguous
failures.

## Page-owned read resources

[`DashboardPage`](../../apps/ui/src/app/pages/dashboard/dashboard.page.ts) provides
`AccountsData`, `TransactionsData`, `SummariesData`, `ObjectivesData` and
`TaggingData`. They are page-scoped, not root singletons. Navigation destroys
resources; another dashboard visit obtains fresh feature state.

The basic read pattern is:

```ts
readonly accounts = resource({
  params: () => this.rpc.authenticatedScope(),
  loader: ({ params: scope, abortSignal }) =>
    scope.client.accounts.list.query(undefined, { signal: abortSignal }),
  defaultValue: [],
});
```

No scope means no protected request. A new scope invalidates old-identity values
and cancels obsolete work. Month selection belongs in reactive params, not an
imperative subscribe chain. Views consume `value()`/`hasValue()`, `isLoading()`,
`error()` and `reload()` rather than maintaining duplicate query-state flags.
Empty data, loading and failure are distinct states, even where a resource has
an empty-array default. Use `hasValue()` before accessing a resource that has no
default or is in an error state.

The activity resource requests `transactions.list` with `{ limit: 10 }` and renders
only that first page. It deliberately does not follow `pageInfo.nextCursor`,
accumulate pages or expose pagination controls. The full history page owns a separate
URL-filtered cursor trail. Its scope cancellation,
retry and confirmed-decision overlay apply to the page's items unchanged.

The tag catalog is lazy: first interaction requests it, and all movements share
it only within that page. Per-movement suggestions are browser-only and requested
for unreviewed, untagged movements. Private pages are browser-only; suggestions
are not part of public prerendering.

## Explicit commands and causal read updates

`createTagDecision()` owns one component's pending/error state, prevents duplicate
submissions, registers pending tasks and ignores outcomes for an obsolete scope,
component or transaction input. `TaggingData` performs the explicit Promise
commands and publishes **confirmed**, not speculative, decisions.

A saved tag/no-tag/reset:

- Updates page-local recent-movement projections from the confirmed decision.
- Invalidates the monthly summary and budget progress, which depend on tags.
- Invalidates the one featured goal's measured savings allocation, also tag-dependent.
- Does not refetch balances, objective declarations, or the tag-independent
  monthly comparison just because a tag changed.

Each recent read captures the current confirmed-decision version when it starts.
On completion, only decisions confirmed **after** that version overlay its rows.
Thus an older in-flight read cannot erase a just-confirmed choice, decisions on
different movements are retained, and a later explicit read can reconcile newer
server state. The decision projection is keyed to the credential scope and never
leaks into the next identity. It does not implement cross-tab synchronization.

Choosing a tag and optionally creating an automatic rule are separate mutations.
If the decision saves but rule creation fails normally, the UI keeps the saved
decision and reports a partial-success warning. Creating a tag before choosing
it is likewise not one distributed transaction; an already-created tag is not
silently deleted if a later command fails. Do not replay the saved command or
pretend it rolled back. Authentication/cancellation errors follow session policy
rather than being shown as a misleading successful rule operation.

## Management command owners

External MCP consent uses the same accepted-credential and component lifetimes,
but a fixed cookie-bound HTTP interaction rather than generic RPC. Its dedicated
client includes API cookies only on that path, validates the interaction ID and
issuer resume destination, and expires only the exact snapshot that received a
401. Approval/denial is explicit and an uncertain result is not resubmitted.
Requested financial write scopes start unchecked and remain bound to the accepted
owner/interaction. Only selected capabilities are submitted; connected-app settings
show actual grants. MCP writes do not use the first-party chat approval cards.
Connected-app settings use page-owned RPC resources and a scoped revoke command
with confirmation and keyboard focus return. Neither page stores external access/
refresh tokens or serializes protected data into hydration. Server-side persisted
single-use decisions and grant ownership remain authoritative; see
[MCP authorization](mcp-authorization.md).

`createScopedCommand()` owns explicit management writes for one component,
registers pending tasks, prevents duplicate submissions, and hides notices/errors
outside the accepted scope and optional record-selection key. It composes a
component lifetime with operation cancellation, suppresses obsolete completions,
and never automatically retries an ambiguous mutation. Record editors are keyed
to their selected ID/write version; owner changes clear drafts and confirmation
targets. Confirmed commands reload their dependent detail/list/summary resources.
Other financial pages refetch when revisited instead of sharing a root cache.

Management editors mount only after an explicit create/edit action, inside the
shared native `EditorDrawer`. Closing, successful saving or an owner/record
change destroys the editor and its component-owned scoped command, rather than
leaving a hidden form or live mutation handler. Tag and dated-expectation forms
own their writes separately from their page/list's archive/remove commands.
Cancelling a pending editor suppresses late success/errors and never claims a
server rollback; reload actions allow explicit read reconciliation. Reopening
starts a fresh draft. Budget/savings detail editors remain keyed to ID/version.
Irregular expectations are accessed independently of source editing, so planning
does not require keeping a source editor mounted or stacking dialogs. Native
focus/inertness and responsive layout are checked in a real browser; jsdom tests
stub only `showModal`/`close` and verify mounting, commands and dismissal events.

Cursor trails for budget/savings history and evidence are selection-bound. Evidence
continuation retains backend observation cutoffs, not totals summed from pages.
Savings evidence compares the returned goal version with its measurement; changed
versions require a fresh read. The dashboard measures only one featured goal;
lists do not issue an unbounded per-goal measurement/suggestion fan-out on entry.

Optional setup progress is derived from owned account/source/objective reads.
`OnboardingData` is a deliberate application/render-local exception for small
non-financial account metadata shared by the shell, dashboard hint and guide;
it is not a financial response cache. Its resource reads `onboarding.state` with
the accepted credential scope, forwards cancellation and has no protected transfer
ID. Loading/error/unknown never means `active`, so a completed user's prompt does
not flash before verification. No onboarding state is read from or saved to
browser storage, including legacy browser-only guide preferences.

The dashboard prompts only active users. Explicit skip hides reminders and leaves
a contextual resume link only for skipped users. Finishing removes both prompt
and link; completed guide URLs redirect to the dashboard. Guide entry reconciles
the stored state, while credential changes/page reloads refetch account metadata.
Completed state is never automatically reset by financial edits or missing steps.
Guide/hint writes use component-owned scoped commands, prevent duplicates and
adopt state only after confirmed success for the same lifetime. Setting the
resource to the confirmed result cancels an older read so it cannot restore a
prompt. Ambiguous failures remain unconfirmed and offer an explicit state check,
not automatic mutation replay. Completion closes the optional guide, not a claim
that optional financial steps or bank import are complete.

## Financial assistant lifetime

`AssistantPage` owns configuration/history/detail resources and a credential-,
selection- and component-bound streamed turn. Creation, deletion and duplicate-send
suppression retain their operation owner across route updates. The NDJSON client
uses bearer/no-store requests with no cookies, expires only its exact accepted
snapshot on 401, validates matching turn IDs/questions and requires a persisted
non-pending `done`. Fragmented UTF-8 is supported; malformed, excessive, foreign or
out-of-order events fail closed. No browser history or owner is sent to the model.

Stop, logout, credential replacement, chat navigation and destruction abort old
work and suppress late callbacks. Stop/disconnection never implies rollback;
failed/missing confirmation is reconciled through an explicit history read, not
generation replay. Pending saved turns block another question. User/answer/source
data and drafts are not stored in cookies, browser storage or transfer state.
References are separate financial cards projected from validated stored results,
not raw JSON or model-authored markup. They retain uncertainty/cutoff disclosures,
show at most four rows with a preview notice, and use service totals rather than
page sums. Trusted links open the relevant section or owned detail; budget evidence
retains the revision, month and observation cutoffs. Current sources explicitly use
null for section-level targets; all turns include their action array. Missing fields
are not upgraded from earlier development formats. Model-generated source codes
are hidden in rendered/copied replies; original evidence remains stored.
Action cards are separate from prose/reference cards. They show saved fields,
current decisions and effects; only an explicit button submits the saved ID/version.
Editing saves a new unapproved revision, and stale/expired selections require
review. A model answer or conversational agreement cannot authorize execution.
Component-owned scoped commands prevent duplicate clicks and suppress obsolete
results. After ambiguous responses the card blocks further writes and offers an
explicit action-status read, never an automatic mutation retry. Confirmed outcomes
reload chat snapshots from the ledger and link to saved results. Deleting chat or
stopping a stream does not undo financial changes or delete durable receipts.

Model-generated HTML/links/images are inactive. The small Markdown presentation
component prefixes its unencapsulated styles with its own host tag so sanitized
generated markup receives typography without altering unrelated screens. See
[provider, persistence, privacy and evaluation limits](financial-assistant.md).

## Explicit banking authorization

`BankConnectionsPage` at `/conexiones-bancarias` (**Mi cuenta → Conexiones bancarias**)
provides `BankingData` for two credential-scoped resources:
server banking configuration and owned connection summaries. Both initial reads
participate in that page's workspace readiness. The separate `/cuentas` page
reads only stored balances and links to connection settings; it starts no banking
reads or Widget flow. Onboarding links to the same settings page and never gates
access to it, whether the guide is active, skipped or completed.
Loading, unavailable configuration, failed reads and an empty connection list are
distinct; no provider requests or per-connection status checks run on page entry.

An explicit connect/relink mounts `BankLinkFlow` **outside native modal drawers**:
Fintoc mounts its iframe under the document body, which a native modal would make
inert. The flow starts only when the user chooses **Abrir Fintoc**. Its component-
owned scoped command creates an intent, verifies the mode matches the user's notice,
opens the hosted Widget and submits the callback's exchange token with that exact
intent. Duplicate callbacks/submissions cannot create multiple completions. Success
is displayed only after backend confirmation for the same accepted scope/lifetime.

`FintocWidget` is browser-only and loads the fixed HTTPS script on demand with a
15-second loading deadline. It shares only the provider script/factory, never an
instance, token, intent or financial result. One operation owns each Widget and
destroys it on exit, success, cancellation, navigation or credential replacement.
Late script loads cannot open an obsolete user's Widget. Bank credentials stay in
the provider iframe; exchange/Widget tokens are not logged or persisted in browser
storage/transfer state. Provider errors are sanitized before rendering.

Cancelling or losing a completion response does not undo external authorization or
a server write. The UI reconciles owned connection reads and requires a fresh
explicit flow instead of replaying the exchange. Disconnect requires confirmation,
preserves history, and reconciles failed responses to show locally disabled access
with pending provider cleanup. Completing cleanup is another explicit command.
Keyboard focus enters the authorization heading and returns to the connections
heading on completion/cancellation; disconnect cancellation restores its trigger.

Access status never advances financial freshness. The separate account-summary
read has no public connection mapping; it is not joined heuristically to banks.
**Datos y sincronización** mounts one connection-owned `BankSyncPanel` at a time.
Its credential/ID/read-version resource calls readonly `banking.syncStatus` and
forwards cancellation. Unopened panels issue no status calls, and settings entry
does not fan out requests for every connection/account. The returned owned account
IDs provide movement links, while values remain in the separate stored-balance page.

The panel's scoped `BankAccountSelector` reads stored selection separately and
performs discovery only after an explicit action. A versioned account-ID set and
automatic-enrollment intent are confirmed together; only a confirmed save can
continue into the existing first-import/refresh command. A pause or current
waiting period does not invent an import result. Missing/unsupported selected
accounts remain removable and history is retained. The shared route carries only
a fixed onboarding return context, never an alternative financial flow.
Selection commands suppress duplicates and latch uncertain responses to a
post-response read version; a prior in-flight read cannot unlock another write.
Scope, connection and component changes cancel obsolete reads/commands.

The panel offers explicit `importInitial` before a confirmed success and `refresh`
afterward. Both use the immutable local first-link day through today; the client
cannot supply an earlier date. Before authorization and in the selected panel,
copy explains no earlier-day backfill, the same-day booking precision, independent
reported balances and preserved older records. Relink does not reset tracking.
Historical-import options remain a future flow. The UI displays backend source
freshness, coverage, exclusions and conflict facts without doing financial
arithmetic. Access, source age and the last successful
import remain independent. The last command's confirmed outcome is labelled as
such, separately from the most recently read status. A successful network response
with `failed`, `in_progress`, `retry_later` or `superseded` is never a completed import.
Its scoped command suppresses duplicates, teardown results and old-owner outcomes.
Sibling lifecycle actions are disabled while its command is pending.

Confirmed command outcomes trigger a new selected-status read, not an automatic
write retry. Confirmed lifecycle fields may update the current connection list
without remounting the panel; older-than-record observations and foreign IDs are
ignored. Failed status reads never mean revocation, zero balance or failed import.
An uncertain write response latches reconciliation to the read version at failure;
another command requires an explicit successful later status read. A read completed
while that mutation was still pending cannot unlock the next attempt. The backend
continues to enforce lease/backoff/version checks against concurrent clients.
An open panel observes at most twelve readonly statuses: five-second intervals
for active work, thirty-second intervals for enabled/enrolled unpaused automation.
There is no provider read or mutation in that observation. Resource failure or
teardown stops its timer; owner/connection changes create a new bounded lifetime.
The explicit status button remains usable after observation ends.

Account aliases use a separate scoped drawer command. Input/owner changes clear
the local draft and pending outcome; only confirmed save emits success. An
uncertain response disables another write and asks the parent to close/reload
stored accounts. This changes neither bank identity nor provider facts and adds
no browser financial cache.

Closing destroys the panel's read/command lifetime and explains that the server may
still be processing. Reopening starts with a fresh readonly status, not a replay.
There is no automatic status polling, global financial cache or cross-page reload
bus. Accounts, movements and financial totals refetch naturally on navigation.

## Public prerendering and browser-owned private rendering

Only `/` is prerendered/hydrated. Login and every protected path use CSR; there is
no request-time Angular/Express server or authenticated HTML. Public rendering does
not initialize Firebase, discover the auth provider, verify a principal or read
financial resources. Angular's server entry/configuration remain build-time tools.

`WorkspaceBoundary` is eager and database-independent. Static `index.csr.html`
contains the same branded loading frame as the Angular component. The boundary
calls shared `SessionService.start()` without blocking rendering. Every workspace
entry (reload or return from public/login routes, even with accepted credentials)
holds the frame for at least one second. Authentication and destination-code
loading run concurrently. Once verified, the outlet mounts immediately in a
concealed, inert, `aria-hidden` wrapper with usable layout dimensions: page-owned
reads start during the animation, never before principal verification. Guest
redirects retain the full path, query and fragment. Startup failures remain on the
requested destination with explicit retry instead of being mistaken for sign-out.

`WorkspaceEntry` shares only screen-import promises, not financial responses.
Each eager `WorkspaceRoutePage` provides a `WorkspacePagePreparation`; the mounted
screen/widgets declare initial visible dependencies with
`reportWorkspaceReadiness(...)`. Readiness requires an explicit declaration and
resource status `resolved`, `local` or `error`, not `hasValue()`/default arrays or
`!isLoading()`. Conditional invalid selections may declare their rendered error
ready instead of waiting on an intentionally idle resource. Security explicitly
declares no reads. Destroying a widget unregisters its checks.

The accounts screen waits only for stored balances. Bank connection settings wait
for banking configuration/connections; unopened authorization flows and the provider
script are not entry dependencies for either page.
The dashboard waits for both summaries, accounts, objectives/progress, recent
activity and the conditional featured savings measurement. Income waits for its
summary and then its visible credit list. Onboarding waits for metadata and only
then eligible checklist reads; completed metadata may redirect to the dashboard.
History includes account/tag catalogs and the initial page, or its invalid-filter
error. Unopened editors, optional suggestions, expanded history/evidence and
additional pages are not entry dependencies. No unbounded fan-out is introduced.

Readiness is confirmed after rendering, so conditional children can register
before a parent's settled read reveals the screen, and is bound to the exact
accepted credential snapshot. Reveal requires both that confirmation and the
minimum second. Slow reads extend preparation; failures reveal usable error/retry
states, including failed imports. After 15 seconds a reload fallback replaces an
indefinite busy animation; later completed preparation can still reveal normally.
The **same mounted page** is revealed, with no second fetch or financial cache.
Focus transfers only after inertness is removed, not on later reloads/navigation.
Owner changes destroy old pages and restart the entrance; credential replacement
cancels obsolete reads. Token refresh, filters and internal navigation do not
replay the entrance once revealed.

The screen inherits the actual `ActivatedRoute`, reactive params, relative links
and page provider lifetimes. Ordinary internal destinations retain heading/skeleton
frames during imports; failed imports have retry, and destroyed hosts cannot adopt
late imports. Screens still own resource loading/empty/error/populated states,
not `@defer` data-readiness wrappers.

Browser startup shares `auth.config`, lazy SDK initialization and restoration.
Firebase owns its persisted identity and refresh. Accepted credentials/principals
stay in memory, never an application cookie or browser permission snapshot. The
legacy `lazyfinance-session` bearer cookie is expired without reading it. Mock
mode alone uses a tab-session demo token, verified again after reload; no principal
or financial data enters that store. Logout clears local access/storage, not
immediate upstream token revocation. Password/linking SDK barriers remain unchanged.
Same-account transient revalidation errors preserve established access with a
warning; identity transitions and rejected credentials conceal the old owner.

Protected tRPC fetches use `cache: "no-store"`; both servers retain private/no-store
headers. Angular HTTP transfer caching remains disabled, protected resources have
no transfer-cache `id`, and components never write financial `TransferState`.
No module-global authenticated client, batch queue or financial response cache is
used. Static HTML is non-personalized/revalidated; only fingerprinted assets are
immutable. Both environments call their explicit API base URL directly:
`http://localhost:3000` in development and `https://api.lazyfinance.cl` in production.
`RpcClient` appends `/trpc`; Nginx does no API proxying or prefix rewriting. API CORS
must allow the UI origin, and browser API/Firebase build identifiers must match deployment.

Editor drawers use native dialogs with immediate component teardown on dismissal,
not retained live forms awaiting an exit animation. Mobile menus close on route
changes as well as link clicks. Tag pickers drop their drafts/overlay on scope or
movement changes, cancel deferred positioning and return action focus to the
trigger. Do not copy PrimeNG exit-snapshot workarounds into these native lifetimes.

## Tests and extension rules

UI tests inject `RPC_FETCH` and exercise real vanilla clients/resources with
in-memory responses. Angular HttpClient interceptors/testing controllers do not
intercept this transport. Tests cover public-only prerendering, neutral first paint,
every-entry animation, reads during the minimum second, dependent-read readiness,
no reveal-time refetch, delayed imports/deep links, protected transfer-state absence,
token/UID replacement, stale 401/restoration failures,
resource/component cancellation, duplicate commands, read/decision ordering and
partial success. Banking tests cover lazy script loading, callback validation,
scope/operation cancellation, backend-confirmed completion, mode changes, same-ID
relinking, pending disconnect recovery, explicit import/reimport, source-age and
failure outcomes, ambiguous-response reconciliation and pending-refresh teardown.
These typed mocked-RPC cases do not establish real provider behavior.
Auth regression cases cover password verification, explicit
same-owner linking, expired/consumed proof, SDK/API/observer races and cancelled
credential mutations with mocked SDK operations. These cases must be executed to
provide runtime evidence; compilation alone is not a passing test run. Run once
without a development/API/database server:

```sh
pnpm --filter ui exec ng test --watch=false
```

When adding a feature, keep its resource/command owner explicit, include accepted
scope in protected query params, forward abort signals, avoid protected hydration
IDs, invalidate only actual dependencies, and test out-of-order completions. Do
not restore the removed catch-all API service, RxJS compatibility facade or fake
HTTP errors. Delivered management workflows are indexed in the UI README;
voice features and bank-forced refresh remain unavailable,
not missing client aliases or simulated success paths. Real-provider browser
verification is separate evidence from mocked UI resource/command tests.
