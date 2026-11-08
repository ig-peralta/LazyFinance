# LazyFinance UI

The UI is an Angular/TypeScript app with routing, server-side rendering (SSR), and client hydration. It is part of the [LazyFinance monorepo](../../README.md) alongside the [API](../api/README.md).

The interface uses PrimeNG components with an Aura-based emerald theme, Tailwind CSS v4 through PostCSS, and `tailwindcss-primeui` for styling utilities. Production builds include a browser bundle and a Node/Express SSR server.

The authenticated workspace has an ink/emerald sidebar, warm light surfaces and
an adaptive overview grid; the public landing retains its existing design.
Mobile navigation uses a native modal dialog for focus containment/Escape handling,
with a skip link and keyboard-visible focus. Financial display formats decimal
strings through bigint cents, retaining nonzero cents and large values without
floating-point rounding. Dashboard income cards distinguish received amounts
from the full-month plan and never describe either as available cash.

`/etiquetas` manages the active owned catalog: create, rename/recolor and explicit
archive confirmation. Archived names remain reserved and historical references are
retained. Its resource is page-owned; commands reject duplicate submissions and
discard obsolete owner/component results. Form drafts are cleared on owner changes
and no financial record is cached in browser storage or hydration transfer state.

Detailed references: [session/resource lifetimes](../../docs/technical/ui-data-lifecycle.md),
[provider-neutral identity](../../docs/technical/identity.md),
[RPC contracts](../../docs/technical/rpc-contracts.md) and
[development/tooling](../../docs/technical/development-workflow.md).

## Development

Install dependencies from the [monorepo root](../../README.md), then start the UI:

```bash
pnpm install
pnpm --filter ui dev
```

Open <http://localhost:4200>. Angular's development server reloads as you edit. To run the API and private persistence too, follow the [root development instructions](../../README.md#run-locally).

## Session and API requests

`initializeServices()` loads the provider, initializes Firebase only in the browser when selected, then resolves the session. Both modes write a token-only SSR cookie; each SSR request revalidates it through the `auth.principal` RPC. The cookie is not proof of authentication. Development uses <http://localhost:3000>; production browser builds use <https://api.lazyfinance.cl>.

Data access uses native, inferred `@trpc/client` Promises and Angular resources. There is no catch-all `ApiService`, RxJS compatibility facade, fake `HttpErrorResponse`, or Angular HTTP interceptor for RPC:

| Boundary                        | Responsibility                                                                                                             |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `core/rpc/rpc-client.ts`        | Request-local clients, immutable bearer scopes, abort propagation, no-store fetch and current-session 401 handling.        |
| `core/auth/auth-credentials.ts` | Accepted verified identity and its cancellation lifetime; no networking or routing.                                        |
| `core/auth/auth-api.ts`         | Explicit anonymous configuration/login and candidate-token verification. Verification never installs or expires a session. |
| `core/auth/session.service.ts`  | Firebase/mock restoration, explicit credential commands, cookie handoff, verification/owner races and expiration routing. |
| `features/*/*.data.ts`          | Page-owned query resources and explicit commands, not another set of endpoint aliases.                                     |
| Components                      | Render resource values/loading/errors and handle presentation interactions.                                                |

The dependency direction is `SessionService → AuthApi → RpcClient → AuthCredentials`; the transport never depends on the session coordinator. A client is reused within one accepted credential snapshot, not recreated for each endpoint or shared between SSR requests. Logout/token replacement aborts its old scope. Late results, late 401s and cancelled commands cannot affect a newer identity.

For example, `AccountsData` owns the whole read lifecycle:

```ts
readonly accounts = resource({
  params: () => this.rpc.authenticatedScope(),
  loader: ({ params: scope, abortSignal }) =>
    scope.client.accounts.list.query(undefined, { signal: abortSignal }),
  defaultValue: [],
});
```

The view consumes `accounts.value()`, `accounts.isLoading()`, `accounts.error()` and `accounts.reload()`. The scope is absent until verification succeeds; changing it invalidates old values. Feature services are provided by `DashboardPage`, so navigation destroys their resources. Month selection is a reactive query input. Activity uses only the first `transactions.list` page (`limit: 10`); continuation controls and a history view are not implemented.

The dashboard distinguishes gross purchase cost, confirmed refunds/reimbursements
and net spending. Recoveries follow the original purchase period/tag; cash recovered
in the credit period is shown separately, not as earned income. Archived budget
purchases can receive later corrections, and pending adjustments are disclosed
without reducing cost. Allocation commands exist in the public RPC, but a refund
management screen is not implemented. See the
[shared semantics](../../docs/technical/rpc-contracts.md#expense-recovery-semantics).

Tag commands publish confirmed decisions to page-local state. Only summaries and budget progress are invalidated; recent movements reflect the confirmed choice without component output/view-child chains. A decision completed after a read started wins over that older read, while a later explicit reload can reconcile changes from elsewhere. The tag catalog is lazy and shared within the page. Rule creation is a separate command: if it fails after saving a decision, the UI reports partial success instead of replaying or pretending to roll back the saved choice. Mutations are never automatically retried; cancelling a request does not guarantee server rollback.

Both environment files currently use the public `lazyfinance-dev` Firebase Web app identifiers. Set `AUTH_PROVIDER=firebase` and `FIREBASE_PROJECT_ID=lazyfinance-dev` on the API, enable **Google and Email/Password**, and authorize the UI's domain in Firebase. Before deploying against another project, update the UI environment file and API project ID together. Admin credentials are never included in the UI. Mock mode works without Firebase or an emulator. Review the [Firebase setup checklist](../../docs/technical/technical-manual.md#firebase-browser-setup) before live verification.

### Sign-in and account methods

- `/login` offers Google, password sign-in, password registration, verification
  resend/recheck and reset-email requests in Firebase mode. A new password account
  must verify its email before first LazyFinance onboarding; registration alone
  installs neither an application principal nor an SSR token cookie.
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
particular a new password does not inherit Google MFA. The existing JavaScript-
readable bearer cookie and local-only logout/revocation limitations remain. See
[identity/security boundaries](../../docs/technical/identity.md#firebase-sign-in-and-credential-linking)
and [session command lifetimes](../../docs/technical/ui-data-lifecycle.md#firebase-commands-and-observer-ordering).

SSR can fetch balances after verification. Clients/auth snapshots are render-request-local, with no module-global client, batch queue or response cache. Fetch uses `cache: no-store` and SSR HTML is private/non-cacheable. Protected resources have no transfer-cache `id`, and components do not manually populate `TransferState`: the browser revalidates its identity and refetches rather than inheriting another session's serialized data. Disabling Angular's HTTP transfer cache alone would not protect manual/resource transfer state. `API_INTERNAL_URL` selects the SSR-only base URL (Compose: `http://api:3000`) without changing the browser URL. Tests inject `RPC_FETCH` and exercise real vanilla clients/resources with in-memory responses; no development/API/database server is needed.

## Commands

Run these from the monorepo root:

| Command                                       | Purpose                                                                                            |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `pnpm --filter ui dev`                        | Start the Angular development server on port `4200`.                                               |
| `pnpm --filter ui build`                      | Build browser assets and the SSR server into `apps/ui/dist/ui`.                                    |
| `pnpm --filter ui watch`                      | Build in watch mode with the development configuration.                                            |
| `pnpm --filter ui test`                       | Run unit tests through Angular's Vitest-based test builder.                                        |
| `pnpm --filter ui exec ng test --watch=false` | Run the serverless UI suite once with in-memory RPC fixtures.                                      |
| `pnpm --filter ui serve:ssr:ui`               | Run the built SSR server (build first; default port `4000`).                                       |
| `pnpm --filter ui ng <command>`               | Pass a command to the Angular CLI; see the [Angular CLI reference](https://angular.dev/tools/cli). |

The Docker UI image runs the built SSR server on container port `4000`; the Compose stacks publish it on host port `4200`.

Its production browser bundle still uses the configured public API URL;
`API_INTERNAL_URL` does not rewrite it. For local containerized browser use, follow
the [browser-versus-SSR configuration notes](../../docs/technical/technical-manual.md#browser-versus-ssr-destination).
