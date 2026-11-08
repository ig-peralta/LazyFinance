# UI data, session and SSR lifetimes

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
| `core/auth/session.service.ts` | Restoration, Firebase commands/observer, cookie handoff, revision/owner checks and expiry navigation | Financial resource state |
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
but no accepted application credentials or SSR cookie. Verification reloads and
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
for unreviewed, untagged movements. They do not make SSR run an N+1 suggestion
query for every row.

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

`createScopedCommand()` owns explicit management writes for one component,
registers pending tasks, prevents duplicate submissions, and hides notices/errors
outside the accepted scope and optional record-selection key. It composes a
component lifetime with operation cancellation, suppresses obsolete completions,
and never automatically retries an ambiguous mutation. Record editors are keyed
to their selected ID/write version; owner changes clear drafts and confirmation
targets. Confirmed commands reload their dependent detail/list/summary resources.
Other financial pages refetch when revisited instead of sharing a root cache.

Cursor trails for budget/savings history and evidence are selection-bound. Evidence
continuation retains backend observation cutoffs, not totals summed from pages.
Savings evidence compares the returned goal version with its measurement; changed
versions require a fresh read. The dashboard measures only one featured goal;
lists do not issue an unbounded per-goal measurement/suggestion fan-out during SSR.

Optional setup progress is derived from owned account/source/objective reads.
Only `active`/`skipped`/`completed` guide preferences live in owner-keyed localStorage,
loaded after browser rendering to avoid changing the hydration DOM. SSR does not
read them, and unavailable storage is disclosed. Closing the guide does not claim
that optional financial steps or unavailable bank linking are complete.

## SSR and hydration isolation

1. The initializer gets public `auth.config`; Firebase Web initializes only in
   the browser when selected.
2. Browser mock/Firebase authentication is verified by `auth.principal` before
   accepting credentials. The browser writes `lazyfinance-session` containing
   only `{ token }`, never a trusted principal.
3. Every SSR request has its own Angular DI/auth/client state. It reads the cookie
   and calls `auth.principal` before protected rendering. A forged/expired cookie
   cannot supply an application user.
4. Browser initialization verifies its own current identity and refetches protected
   resources after hydration rather than inheriting serialized financial results.

The cookie is JavaScript-readable, SameSite=Lax and Secure on HTTPS; it is not an
HttpOnly server-managed session or a Firebase session cookie. Treat it as a bearer
transport with the same XSS/expiry risks as the token. Logout is local clearance,
not immediate server-side token revocation.

The protections against cross-identity hydration are deliberately layered:

- Vanilla tRPC fetches use `cache: "no-store"`; both tRPC servers return private,
  no-store headers. Rendered HTML is private/no-store, while static assets retain
  their separate long-lived caching policy.
- Angular HTTP transfer cache is disabled, **and** protected resources have no
  transfer-cache `id`, **and** components do not manually write financial
  `TransferState`. Disabling HttpClient transfer caching alone does not cover
  Angular resource/manual transfer state or vanilla fetch.
- No module-global authenticated client, batch queue or response cache is used.

SSR can render authenticated financial HTML; the absence of transfer-state JSON
does not mean no private content is present in that HTML. Keep shared proxies/CDNs
from caching it. `API_INTERNAL_URL` changes only the SSR transport destination
(Compose: `http://api:3000`); browser API/Firebase identifiers remain build-time
environment configuration and must be deployed consistently.

## Tests and extension rules

UI tests inject `RPC_FETCH` and exercise real vanilla clients/resources with
in-memory responses. Angular HttpClient interceptors/testing controllers do not
intercept this transport. Tests cover concurrent SSR identities, protected
transfer-state absence, token/UID replacement, stale 401/restoration failures,
resource/component cancellation, duplicate commands, read/decision ordering and
partial success. Auth regression cases cover password verification, explicit
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
conversational features and live banking-provider linking remain unavailable,
not missing client aliases or simulated success paths.
