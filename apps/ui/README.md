# LazyFinance UI

The UI is an Angular/TypeScript app with a build-time-prerendered public landing and client-rendered login/private routes. It is part of the [LazyFinance monorepo](../../README.md) alongside the [API](../api/README.md).

The interface uses PrimeNG components with an Aura-based emerald theme, Tailwind CSS v4 through PostCSS, and `tailwindcss-primeui` for styling utilities. Production serves static browser output through unprivileged Nginx; Angular's server packages support public build-time prerendering, not a request-time web server.

## Rendering and startup

- `/` is prerendered and hydrated without Firebase initialization or API requests.
- Login and all authenticated routes use CSR. No private user/financial HTML is
  prerendered, and no protected resource is put in transfer state.
- `src/index.html` contains the same neutral frame as `WorkspaceLoading`, visible
  before Angular or Firebase loads. Their styles live in `src/workspace-loading.css`.
- The eager `WorkspaceBoundary` starts shared browser restoration asynchronously.
  Every workspace entry (reload or return from public/login routes, including an
  already-verified session) shows at least one second of animation. Destination
  code loads concurrently with authentication; verified pages immediately mount
  invisibly/inertly and start their page-owned reads during that second.
- A route-scoped `WorkspacePagePreparation` collects explicit
  `reportWorkspaceReadiness(...)` declarations for initial visible reads, including
  conditional child reads. Default empty arrays/idle resources are not readiness.
  Confirmation follows rendering and belongs to the accepted credential snapshot.
  After both the minimum second and readiness, the same instance is revealed:
  there is no second mount/fetch or application-wide financial cache.
- Slow reads extend the animation; settled errors reveal usable retry/error states.
  A 15-second deadline exposes a reload fallback, and late successful preparation
  can still recover. Hidden content is excluded from interaction/accessibility,
  with focus moved only after reveal. Internal navigation, token refresh and filters
  never replay the entrance; ordinary destination frames/resource states still apply.
- Every destination uses the eager `WorkspaceRoutePage`; its screen keeps the same
  `ActivatedRoute`, reactive parameters, relative links and page-owned providers.
  Failed imports are retryable; obsolete imports cannot mount after navigation.
- Page resources own loading, empty, error, populated and retry states. Do not use
  `@defer` as a substitute for reactive data state or add a root financial cache.

The static output under `dist/ui/browser` contains public `index.html` and neutral
`index.csr.html`. Nginx on port `4000` preserves client deep links, revalidates HTML,
caches only fingerprinted assets immutably, enables gzip and returns 404 for
missing assets. It serves only UI files, with no API proxy, prefix rewriting or
backend/Docker DNS dependency. Browser requests use the explicit API base URL from
the selected Angular environment. Static startup never waits for API/database
readiness. Other UI hosting only needs equivalent static fallback/caching.

## Authenticated workspace

The authenticated workspace uses dark surfaces, emerald accents, rounded cards
and pill actions aligned with the public landing's visual language. Its dark
tokens are workspace-scoped, including PrimeNG controls; the public landing and
login retain their existing system-aware theme.

Navigation includes **Asistente**, **Resumen**, **Mi dinero** (movements, accounts,
tags), **Planificación** (budgets, savings, income and sources), and **Mi cuenta**
(access/security, connected applications, bank connections, plus a resume link only for skipped setup).
Bank connection settings stay reachable regardless of whether setup is active,
skipped or completed. Direct contextual links appear above the page, wrap rather
than scroll, and retain the active destination on detail routes.
The sidebar has no internal scrolling or expandable lists. Narrow or short
viewports replace it with a compact native modal menu, including a two-column
layout on short screens, focus containment and Escape handling. A skip link and
keyboard-visible focus remain available.

Financial editors are opened explicitly instead of occupying a permanent page
column: tags, budget/savings creation and adjustments, income sources and dated
expectations, receipt confirmation and movement corrections use a shared
right-side modal panel. It slides in on desktop and fills narrow screens, with a
fixed header, independently scrolling content, reachable actions and safe-area
padding. Native dialogs contain focus, make the underlying page inert, support
Escape/backdrop dismissal and return focus to the opener; reduced-motion users
get no slide animation. Closing unmounts the editor, clears its draft and cancels
its client command lifetime. It does not undo a write already sent to the server;
use the page's reload action to reconcile an uncertain result before retrying.
Source editing and irregular-payment planning are separate actions; expected
payments expand under their source and open their own editor, never a nested
modal. Filters, month selectors and sign-in forms stay in place.

`/autorizar-mcp?interaction=…` is a private, cookie-bound OAuth consent page, not
an external-client login form. It displays the accepted account, declared client,
actual callback hostname, read permission and optional requested write capabilities
(unchecked by default) before explicit
approval/denial. `/aplicaciones-conectadas` lists owned grants and requires explicit
revoke confirmation. Neither page exposes OAuth tokens to the UI or modifies bank
connections/financial facts. Reads/commands are scope-cancelled, obsolete results
cannot navigate or expire a newer login, and uncertain decisions are not replayed.
See [OAuth browser/site configuration and compatibility](../../docs/technical/mcp-authorization.md).

`/asistente` provides financial questions, explicit suggestions, streamed replies,
Stop, server-owned history, separate financial reference cards, copy and confirmed
chat deletion. Cards replace raw JSON with formatted amounts, periods, uncertainty
and bounded previews, and link to the relevant app section or owned detail. Inline
source codes are hidden in saved/streamed replies and copied text. Markdown cannot
create active model links, images or HTML. No provider
key, financial history or draft enters browser storage or protected hydration.
Accepted-scope/selection/component cancellation suppresses late events; an
uncertain stream result requires a history read, never automatic resend. The UI
labels disabled and offline-demo states and discloses the configured external
provider/model before sending. Separate action cards show exact proposals for
budget/goal creation, tag management and single-movement tagging. Tag colors use
visual swatches and native color pickers, not displayed hex codes. Approve submits
only a saved ID/version; Edit saves a new unapproved version, and Cancel is not an
undo. Stale/expired proposals require review. Ambiguous action outcomes block
another write until an explicit status read; stopping/deleting chat never reverses
committed finance or deletes durable receipts. MCP consent delegates separately
selected capabilities without these chat buttons. See [configuration, limits, privacy and evaluation](../../docs/technical/financial-assistant.md).

The dashboard leads with selected-month net spending, received income and the
full-month income plan, followed by workflow shortcuts, spending analysis,
planning, stored account balances and recent activity. Balances are not added
across different account types or confused with income/available cash. Financial
display formats decimal strings through bigint cents, retaining nonzero cents
and large values without floating-point rounding. Income cards distinguish
confirmed receipts from plans; neither is presented as available cash.

Spending by tag uses an SVG distribution ring with a readable exact-amount and
percentage legend, including the untagged remainder. At most five named tags,
an exact "other tags" aggregate and untagged spending appear in the ring; an
expandable breakdown retains every tag, counts and gross/recovery/net amounts,
including fully recovered purchases. Only visual coordinates and percentages
use bounded numbers; amount arithmetic uses bigint cents. Zero spending and
inconsistent/non-proportional amounts do not produce a fabricated chart. The
backend's purchase-attributed recovery semantics and pending-review disclosures
are unchanged. Chart colors are a presentation palette, not edits to tag colors.

`/etiquetas` manages the active owned catalog: create, rename/recolor and explicit
archive confirmation. Archived names remain reserved and historical references are
retained. Its resource is page-owned; commands reject duplicate submissions and
discard obsolete owner/component results. Form drafts are cleared on owner changes
and no financial record is cached in browser storage or hydration transfer state.

`/movimientos` is a URL-filtered cursor ledger (account, Santiago dates, nullable
tag/internal status, direction and literal merchant substring). Previous/next
controls keep a page-local cursor trail, reset on filter/scope changes, and never
sum pages into financial totals. Inline search, charge/credit shortcuts and removable
chips expose applied filters. Advanced filters expand within the ledger and keep
drafts separate until confirmation, with current/previous-month presets. Search
and direction confirmations include any staged filters; collapsing or Escape
discards that draft and restores focus. Catalog failures preserve selected IDs,
and owner changes clear unsubmitted drafts.
`/movimientos/:id` reads owned source and
classification detail without changing the original banking facts.
The detail view supports explicit tag/no-tag/reset and nullable internal-status
corrections. A saved command reloads detail; history, summaries and budget pages
refetch on navigation rather than sharing a stale application-wide cache. Removed
records are read-only, and the backend remains authoritative for valid references.

`/ingresos/fuentes` manages owned fixed/variable, regular/irregular declarations,
all supported weekly/14-day/monthly/twice-monthly schedules, archival and dated
expectations. Exact decimal input accepts a decimal comma without interpreting
thousands separators. Unknown variable amounts remain unknown, and declarations
or expectations never create received payments automatically.
`/ingresos` separately displays full-month plans, included estimates, unknown
amounts, received confirmations, unclassified credits and recovered expenses.
Its paginated external-credit browser opens one owned detail to validate facts;
confirmation/reassignment and explicit clearing preserve booked amounts/dates.
Retained links remain clearable even when current facts no longer count as income.

`/presupuestos-y-metas` creates spending budgets and shows backend net progress;
`/presupuestos/:id` separates effective/pending revisions, paginated history and
version-checked edit/archive. Started recurring edits apply next month/year;
started fixed budgets are read-only apart from archival. New schedules use aligned
monthly/yearly starts or inclusive fixed dates. Overlapping budgets are not summed
as a combined allowance, and no command reserves cash or changes banking facts.
Budget figures open `/presupuestos/:id/movimientos` with the report's revision,
month and observation cutoffs. Its complete backend totals (not page sums)
separate original purchases, refunds, reimbursements and net spending. Continuation
retains returned cutoffs, explains current-fact drift and never claims complete
bank coverage. Changed revisions require reopening the current progress selection.

`/metas` creates selected-tag lifetime/monthly/yearly/fixed savings targets;
`/metas/:id` provides owned detail, immutable configuration history and expected-
version edit/archive. Savings edits restate the current allocation view immediately
rather than changing next period's spending limit. Archival preserves direct
detail/history and does not move cash or generate contributions.
The goal detail and one featured dashboard goal use backend-measured savings
allocations, remaining target, raw signed percentage and paginated evidence.
Negative/over-target values remain visible; bars alone are bounded visually.
Pending movements, partial/unknown history and target-only/error fallbacks are
explicit. Evidence retains its booking cutoff and rejects mismatched goal
versions; it is current-fact evidence, not historical time travel. Dashboard tag
decisions invalidate savings allocations as well as spending/budget reads.

`/cuentas` (**Mi dinero → Cuentas**) owns stored account balances, last-sync dates
and links into movement history. It does not load banking settings or contact
Fintoc. A **Conectar banco** shortcut and the empty state link to the separate
connection settings; they do not launch authorization themselves.

`/conexiones-bancarias` (**Mi cuenta → Conexiones bancarias**) supports owned Fintoc
authorization, explicit access checks, same-bank/same-holder relinking and confirmed
disconnect. The page links back to stored accounts. Server configuration determines
whether linking is enabled and whether the Widget uses test or live mode. Test
mode warns against real credentials and links to Fintoc's public test identities.
The hosted Widget loads only after **Abrir Fintoc**; its callback is bound to the
backend-created intent, and only backend confirmation establishes a saved connection.
Navigation, cancellation and credential replacement close the Widget and discard
late results. A failed/uncertain exchange offers read reconciliation, not replay.
Disconnect preserves financial history and shows pending remote cleanup when needed;
local disconnect remains available if provider configuration is disabled/mismatched.

**Datos y sincronización** opens one selected connection's status panel, not a
fan-out of provider calls on page entry. The readonly backend status identifies
that connection's accounts and reports access, attempt activity, last success/
failure, retry timing, conflicts, source freshness and retained history bounds.
Its per-account movement links use the returned owned account IDs. Balances still
belong to `/cuentas`; no client-side balance reconstruction or connection guessing
is added to the public account-summary projection.

**Importar datos disponibles** calls the explicit initial-import command; after a
confirmed success, **Actualizar datos disponibles** replays the backend's bounded
snapshot. Neither action forces the bank to refresh. Authorization completion opens
the panel but never imports automatically. Counts describe examined provider
records, not new rows or recognized income. Unsupported accounts, unknown card
balances, pending/processing exclusions, partial requested history and uncertain
movement classification remain explicit. The UI performs no provider normalization
or spending/income/savings calculations.

Tracking begins on **the connection's first-link day in Santiago** and continues
forward, not with a 90-day transaction backfill. Authorization and synchronization
explain the start date, which does not move on refresh or same-identity relink.
Fintoc supplies reliable accounting days, not an exact-time cutoff, so records
earlier within that same day may appear. The requested period is disclosed after
each completed import. Current balances are brought independently, including when
there are no tracked movements; no opening transaction is manufactured. Historical
import choices/month/payroll exceptions are not implemented. Earlier records already
imported are retained, but days before the linking boundary are not fetched again.

**Consultar estado** only reads saved facts. In-progress and interrupted attempts,
backoff, failed imports and expired/revoked access have distinct presentations.
Successful import does not make a stale/unknown source recent. The backend's
per-account freshness is displayed with its observation time and 24-hour policy;
history bounds are observed extremes, not proof of complete or continuous history.
Provider suspensions and other conflicts retain their different meanings.

Commands prevent duplicate submission and discard obsolete scope/component results.
A confirmed outcome reloads only the selected status; confirmed lifecycle fields
can update the page-local connection projection without destroying the outcome.
An ambiguous transport failure requires an explicit successful status read made
after that failure before another write is enabled. A pre-response read cannot
unlock a retry. There is no automatic polling or mutation replay. Closing a panel
stops waiting, not server processing; reopening reconciles its durable lease.
Other financial pages read fresh data when navigated to, without a root cache.
Server configuration/mode and authoritative status eligibility both gate imports;
readonly status and local disconnect remain available when configuration is disabled.
See the [backend contract/setup](../api/src/banking/fintoc/README.md).

Before the navigation split, browser verification on 8 November 2026 exercised
the actual authenticated app, hosted Fintoc sandbox Widget, API, signed persistence and an isolated PostgreSQL
database. Initial authorization, access check, same-ID relink and confirmed remote
disconnect passed. Stored credentials were encrypted and cleared on disconnect;
no accounts/movements were imported. Only the newly created sandbox Link was
removed; pre-existing provider Links were preserved. Desktop and 390px layout,
keyboard focus/cancel, provider exit, navigation/logout cleanup and a deliberately
failed access-check response were verified. The accounts screen had no automated
axe WCAG A/AA violations in that check; this is not an audit of Fintoc's iframe,
screen-reader coverage, live-bank consent, financial refresh or production readiness.

The navigation split was separately verified against production static output
with mocked RPC: accounts/settings return links, skipped/completed onboarding,
desktop/mobile **Mi cuenta** navigation and authorization focus/cancellation.
Widths 320/390/768/1440 had no horizontal overflow, and the new connection-settings
screen had no automated axe WCAG A/AA violations in the tested state. This used
an ephemeral non-default loopback port, shut down afterward; it did not rerun
the real provider flow or access the user's development database.

### Import/refresh browser verification — 8 November 2026 (LAZ-62)

This dated check predates the first-link tracking policy and used the former 90-day
window. Its lifecycle/recovery evidence does not describe the current import scope.

Production static output was exercised in Chromium through actual public/private
RPC and a restricted PostgreSQL login in a fresh disposable database. Two mocked
application identities used the real authentication/ownership boundary; this was
not live Firebase verification. The hosted Fintoc sandbox flow authorized a new
connection, then an explicit UI import recorded three accounts and 1,592 movements.
Readonly status made no provider call. Refresh preserved prior movement IDs and
checked manual tags/internal-status choices and a confirmed income receipt; spending
and received-income totals reconciled independently through the backend. Additional
provider records appeared during later snapshots/relink without replacing old IDs.

The same run checked account/movement navigation, concurrent refresh coalescing,
stale source dates with an injected 503 and successful recovery, injected expired
access followed by real same-identity relink, logout during a pending refresh,
session rejection and foreign-owner status/refresh denial. Source aging, outage and
expiry were controlled fault injection, not naturally observed bank failures.
Keyboard interaction and widths 320/390/768/1440 passed without horizontal overflow;
the tested settings state had no automated axe WCAG A/AA violations or browser
errors. This does not audit the provider iframe or establish full accessibility.

Every attempt cleaned up its own disposable Link, database,
runtime login and ephemeral listeners, preserving all four pre-existing Links.
The configured review database and application environment files were not changed.
These checks do not establish live-bank consent, provider SLAs, maximum-size commit
performance or production readiness.

### First-link tracking browser verification — 8 November 2026

Production static output was separately exercised in Chromium with **mocked RPC**
for the new first-link policy. The check covered pre-authorization disclosure and
focus restoration, the Santiago link day across a UTC-date boundary, retained-record
and same-day precision notices, no historical-date selector, an explicit import
with one account and zero movements, and a subsequent explicit refresh. Both writes
sent only the connection ID. Widths 320/390/768/1440 had no horizontal overflow;
the tested settings state had zero automated axe WCAG A/AA violations or browser
errors. The ephemeral non-default loopback listener was stopped afterward.

This browser check contacted neither Fintoc nor a database. Separate real-RPC tests
against disposable PostgreSQL verified the provider request cutoff, independent
balances with zero movements, stable relink boundary and retained pre-link decisions
and receipts with a mocked provider. The API suite passed 406 tests with one
conditional live-Firebase skip; persistence integration passed 26 tests and the UI
suite passed 353 tests. No new live-provider check of the first-link policy is claimed.

`/comenzar` is optional setup navigation without automatic financial writes. Its
bank shortcut opens `/conexiones-bancarias` directly; skipping or completing the
guide never removes access to connection settings.
Checklist progress comes from persisted owned accounts, sources and objectives;
failed reads are unverified, not completed or empty imports. Small credential-
scoped `OnboardingData` metadata is shared by shell/hint/guide and persisted per
account through `onboarding.state`/`onboarding.finish` in PostgreSQL, never browser
storage or protected transfer state. The dashboard card appears only for active
users and supports explicit dismissal. Skipped users get no recurring prompt,
but can resume from **Mi cuenta → Retomar configuración** without reactivating
reminders. Completion permanently hides both entry points; direct guide visits
redirect to the dashboard. Unknown/loading/error state never means a pending
guide. Writes wait for confirmation, reject duplicate/obsolete results and allow
explicit reconciliation after ambiguous failures. Legacy browser flags are not
silently imported; an explicit skip/finish saves the account-level choice.
Closing the guide does not claim optional financial setup or bank linking is
complete, and later financial edits never reopen it.

Detailed references: [session/resource lifetimes](../../docs/technical/ui-data-lifecycle.md),
[provider-neutral identity](../../docs/technical/identity.md),
[RPC contracts](../../docs/technical/rpc-contracts.md) and
[development/tooling](../../docs/technical/development-workflow.md).

## Page organization

Under `src/app/pages`, related components, templates and tests stay together:

- `income/`: the summary page, `credit-browser/`, `receipt-editor/` and `sources/`.
  Source management owns its form helpers, `source-editor/` and `expectations/`.
- `objectives/`: the overview page, `budgets/` (with its editor and `evidence/`),
  `savings/` (with its editor), and `forms/` shared by both objective workflows.
- `transactions/`: `history/` owns the ledger and filters; `detail/` owns the
  movement page and its `corrections/` component.
- `accounts/`: stored balances and shortcuts to connection settings/history.
- `banking/`: the bank-connections settings page owns access reads/checks/disconnect;
  `bank-link-flow/` owns one cancellable intent/Widget/completion, and
  `bank-sync-panel/` owns the selected connection's status and explicit sync commands.
- `dashboard/`: overview panels; `summary/` owns the distribution chart and its
  exact-amount presentation calculation/tests. Navigation configuration belongs
  to `layout/app-shell/`, not to individual financial workflows.

Lazy routes import the owning page directly; there are no old-path re-exports.

## Development

Install dependencies from the [monorepo root](../../README.md), then start the UI:

```bash
pnpm install
pnpm exec turbo build --filter=ui^...
pnpm --filter ui dev
```

Open <http://localhost:4200>. Angular's development server reloads as you edit. To run the API and private persistence too, follow the [root development instructions](../../README.md#run-locally).

The dev server bundles `@lazyfinance/contracts` and its Zod runtime with application
code rather than prebundling this mutable workspace package as a third-party
dependency. Rebuild the shared package after contract changes. After changing
dev-server options, restart the UI task once and reload the browser; an
already-running server keeps its previous prebundle configuration. Do not reset
data or rotate OAuth keys to resolve a stale UI bundle.

## Session and API requests

`SessionService.start()` shares provider discovery, lazy Firebase initialization
when selected, and API principal verification. Login and workspace entry call it;
the public landing does not. Firebase owns browser identity persistence and token
refresh; verified application credentials stay in memory. Startup expires the
legacy `lazyfinance-session` cookie without reading it. Mock mode stores only its
demo token in tab-local `sessionStorage`, revalidates it on reload, and clears it
on logout. No principal, permissions or financial results are persisted there.
Development uses <http://localhost:3000>; production uses
<https://api.lazyfinance.cl>. `RpcClient` appends `/trpc` to that base URL. The API's
`CORS_ORIGINS` must allow the actual UI origin. Production URLs are compiled into
the Docker UI too; choose a browser-reachable local API URL and rebuild for an
entirely local container rehearsal.

Data access uses native, inferred `@trpc/client` Promises and Angular resources. There is no catch-all `ApiService`, RxJS compatibility facade, fake `HttpErrorResponse`, or Angular HTTP interceptor for RPC:

| Boundary                        | Responsibility                                                                                                             |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `core/rpc/rpc-client.ts`        | Application-local clients, immutable bearer scopes, abort propagation, no-store fetch and current-session 401 handling.        |
| `core/auth/auth-credentials.ts` | Accepted verified identity and its cancellation lifetime; no networking or routing.                                        |
| `core/auth/auth-api.ts`         | Explicit anonymous configuration/login and candidate-token verification. Verification never installs or expires a session. |
| `core/auth/session.service.ts`  | Shared browser restoration, retryable failures, explicit credential commands, verification/owner races and expiry. |
| `features/*/*.data.ts`          | Page-owned query resources and explicit commands, not another set of endpoint aliases.                                     |
| Components                      | Render resource values/loading/errors and handle presentation interactions.                                                |

The dependency direction is `SessionService → AuthApi → RpcClient → AuthCredentials`; the transport never depends on the session coordinator. A client is reused within one accepted credential snapshot, not recreated for each endpoint. Logout/token replacement aborts its old scope. Late results, late 401s and cancelled commands cannot affect a newer identity. Transient same-account revalidation failures keep established screens mounted with a retry warning; rejected credentials and identity changes conceal old content. The workspace boundary owns guest redirects and preserves the full return URL.

For example, `AccountsData` owns the whole read lifecycle:

```ts
readonly accounts = resource({
  params: () => this.rpc.authenticatedScope(),
  loader: ({ params: scope, abortSignal }) =>
    scope.client.accounts.list.query(undefined, { signal: abortSignal }),
  defaultValue: [],
});
```

The view consumes `accounts.value()`, `accounts.isLoading()`, `accounts.error()` and `accounts.reload()`. The scope is absent until verification succeeds; changing it invalidates old values. Feature services are provided by their page, so navigation destroys their resources. Month selection is a reactive query input. Dashboard activity uses only the first `transactions.list` page (`limit: 10`); the separate history page owns filters and continuation.

The dashboard distinguishes gross purchase cost, confirmed refunds/reimbursements
and net spending. Recoveries follow the original purchase period/tag; cash recovered
in the credit period is shown separately, not as earned income. Archived budget
purchases can receive later corrections, and pending adjustments are disclosed
without reducing cost. Allocation commands exist in the public RPC, but a refund
management screen is not implemented. See the
[shared semantics](../../docs/technical/rpc-contracts.md#expense-recovery-semantics).

Tag commands publish confirmed decisions to page-local state. Summaries, budget progress and featured savings allocations are invalidated; recent movements reflect the confirmed choice without component output/view-child chains. A decision completed after a read started wins over that older read, while a later explicit reload can reconcile changes from elsewhere. The dashboard tag catalog is lazy and shared within the page. Rule creation is a separate command: if it fails after saving a decision, the UI reports partial success instead of replaying or pretending to roll back the saved choice. Mutations are never automatically retried; cancelling a request does not guarantee server rollback.

Both environment files currently use the public `lazyfinance-dev` Firebase Web app identifiers. Set `AUTH_PROVIDER=firebase` and `FIREBASE_PROJECT_ID=lazyfinance-dev` on the API, enable **Google and Email/Password**, and authorize the UI's domain in Firebase. Before deploying against another project, update the UI environment file and API project ID together. Admin credentials are never included in the UI. Mock mode works without Firebase or an emulator. Review the [Firebase setup checklist](../../docs/technical/technical-manual.md#firebase-browser-setup) before live verification.

### Sign-in and account methods

- `/login` offers Google, password sign-in, password registration, verification
  resend/recheck and reset-email requests in Firebase mode. A new password account
  must verify its email before first LazyFinance onboarding; registration alone
  installs neither an application principal nor persisted application credentials.
- Authenticated `/seguridad` ("Acceso y seguridad") connects methods to the same
  Firebase UID: Google-only users confirm Google again before adding a password;
  password-only users confirm their current password, then click a separate
  Google popup button. That readiness proof expires after five minutes and is
  single-use. Password inputs are cleared on submission, not stored for retries.
- A linked method must retain the same internal financial owner after fresh API
  verification. Email matches do not merge accounts/data. Separate Firebase UIDs,
  unlinking and cross-provider namespace linking are unsupported.
- SDK popups cannot truly be aborted, and a confirmed credential mutation cannot
  be rolled back by leaving the page. Session barriers and UID/owner checks stop
  obsolete results from accepting another identity. A failed link should be
  reconciled by checking its actual methods, not automatically replaying it.

Either connected method can grant access on its own; this is not MFA. In
particular a new password does not inherit Google MFA. Browser-held bearer tokens
and local-only logout/upstream-revocation limitations remain. See
[identity/security boundaries](../../docs/technical/identity.md#firebase-sign-in-and-credential-linking)
and [session command lifetimes](../../docs/technical/ui-data-lifecycle.md#firebase-commands-and-observer-ordering).

Private pages fetch only in the browser after principal verification. There is no
module-global client, batch queue, financial response cache or authenticated HTML.
Fetch uses `cache: no-store`; protected resources have no transfer-cache `id`, and
components do not populate financial `TransferState`. Tests inject `RPC_FETCH` and
exercise real vanilla clients/resources with in-memory responses; no development,
API or database server is needed. Rendering tests cover public-only prerendering,
  every-entry animation, concurrent preparation, dependent reads, deep links,
  cancellation and guest/error boundaries.
Native editor drawers deliberately unmount on close (there is no retained live
form/exit animation). The mobile menu closes on all navigation, and tag pickers
discard drafts on scope/record changes, cancel delayed positioning and restore focus.

## Commands

The test builder enables per-file isolation instead of Angular's shared-test
default. This keeps Firebase SDK mocks and jsdom document/event realms from
leaking across specs; shared code splitting remains enabled. Isolation adds
document setup time, reported by Vitest, and does not affect production bundles.
SDK tests block unexpected network requests and do not contact Firebase. Fixture
events use their own document's event factory.

Run these from the monorepo root:

| Command                                       | Purpose                                                                                            |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `pnpm --filter ui dev`                        | Start the Angular development server on port `4200`.                                               |
| `pnpm --filter ui build`                      | Prerender the landing and build static browser assets into `apps/ui/dist/ui/browser`.                                    |
| `pnpm --filter ui watch`                      | Build in watch mode with the development configuration.                                            |
| `pnpm --filter ui test`                       | Run unit tests through Angular's Vitest-based test builder.                                        |
| `pnpm --filter ui exec ng test --watch=false` | Run the serverless UI suite once with in-memory RPC fixtures.                                      |
| `pnpm --filter ui ng <command>`               | Pass a command to the Angular CLI; see the [Angular CLI reference](https://angular.dev/tools/cli). |

The Docker UI image serves static output on container port `4000`; Compose
publishes it on host port `4200`. The API remains separate and its browser URL is
selected at build time. See the
[static hosting configuration](../../docs/technical/technical-manual.md#browser-and-static-hosting-destinations).
