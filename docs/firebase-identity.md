# Firebase identity boundary

Firebase authenticates a person; LazyFinance's own `user.id` is the financial owner. The
two identifiers must not be interchangeable. LAZ-46 supplies a verifier and a
trusted identity contract, LAZ-44 connects external identities to application
users, and LAZ-43 adds browser sign-in and API-revalidated SSR sessions.

## Initial sign-in and token contract

- The first supported production browser sign-in is **Google through Firebase Auth**.
  Enable Google sign-in for the configured Firebase project; additional providers
  need a separate product decision. The verifier checks Firebase project identity,
  not the UI's choice of sign-in method. The UI offers Google sign-in when the API
  selects Firebase.
- A first-party client sends `Authorization: Bearer <Firebase ID token>` to the
  API. This must be an ID token from Firebase Auth, not a Google OAuth access
  token, Firebase custom token, UID, or Firebase session cookie.
- `FIREBASE_PROJECT_ID` is the expected Firebase project. The Firebase Admin SDK
  verifies signature, lifetime, and token claims. In particular, the audience
  must equal that project ID and the issuer must equal
  `https://securetoken.google.com/<project-id>`. The verifier additionally
  checks the issuer, audience, and nonempty subject in its decoded output.
- The verifier returns the provider-neutral `VerifiedExternalIdentity` contract:
  `{ provider: 'firebase', issuer, providerSubject, verifiedEmail, displayName }`.
  For Firebase, `issuer` is `https://securetoken.google.com/<project-id>` and
  `providerSubject` is the Firebase UID. `verifiedEmail` is null unless Firebase
  asserted `email_verified: true`.
  Neither email nor display name grants financial access. Do not accept this
  contract in a client request as proof of authentication: shape validation does
  not verify a token.
- `verifyIdToken` checks expiry but does **not** check token revocation by
  default. An already issued ID token may remain usable until it expires (usually
  about an hour); logout clears local access but is not server-side token
  revocation. Any immediate-revocation policy needs separate support and
  operational configuration.

## Application and MCP subjects

The backend resolves the verified `(provider, issuer, providerSubject)` to a
single stable application `user.id` (UUID), provisioning it once if necessary.
The issuer namespaces subjects across projects and future external providers.
The existing shared `AuthPrincipal` remains `{ userId, email, name }`, with
`userId` set to that internal UUID. Financial records continue to reference
the internal UUID. The external identity has a unique database key, and first
sign-in creates its user and mapping atomically so concurrent attempts resolve
the same user. First-time provisioning requires a verified email. If the email
already belongs to another application user (including the demo user), access
returns 409 rather than automatically linking that user's financial data.
An existing user can still resolve by subject when a later token has no verified
email; email and display-name changes do not remap that user. Authentication
tokens are not stored on financial users.

HTTP and MCP authorization currently read the same request principal. LAZ-52
chooses authorization for external MCP clients independently; its accepted
client token should resolve to the **same internal application user ID**, not
be treated as a Firebase ID token or substitute its own subject for `userId`.
`AUTH_PROVIDER=mock` simulates an external identity provider with hardcoded
local credentials. Its token verifier returns `VerifiedExternalIdentity` with
`provider: 'mock'`, issuer `https://mock.lazyfinance.cl`, and subject `demo`.
The demo seed links that identity to the existing demo financial user. Mock
sessions resolve that link through the same identity repository as Firebase,
but never provision another demo user if the link is missing. The fixture token
is not stored on the `user` table and is unavailable in Firebase mode.
The public `GET /auth/config` exposes only `{ provider: 'mock' | 'firebase' }`
so the UI can select the appropriate login inputs. `POST /auth/mock/login`
is available only in mock mode and returns the seeded bearer token for valid
credentials; the demo token is rejected in Firebase mode. Mock mode is refused
when `NODE_ENV=production`. Firebase-mode protected HTTP and MCP requests now
use the verified identity mapping to obtain the same internal principal; the
external-client MCP authorization scheme remains a separate workstream.

## Browser and SSR session boundary

The browser initializes the Firebase Web SDK only on the client, signs in with
Google, obtains and refreshes Firebase ID tokens, and sends them to the API as
bearer tokens. Firebase's local persistence restores the browser identity.
To hand the current token to SSR, the browser writes a secure (on HTTPS),
SameSite=Lax cookie containing **only the ID token**, never an application
principal. The cookie is readable by same-origin JavaScript; it is a transport,
not a trusted session record. SSR reads the token but must call the API's
`/auth/principal` to verify and resolve the internal user before rendering any
protected route.
An invalid, expired, or forged cookie is discarded; the browser can recover
from Firebase persistence after hydration. Authentication guards wait for
session restoration, and protected HTTP responses are excluded from Angular's
transfer cache so a different browser identity cannot inherit private data.
Sign-out clears both Firebase local persistence and the SSR handoff cookie.
Mock mode uses the same token-only cookie handoff and API revalidation, without
ever treating the cookie as a trusted user record.

## Configuration and local verification

`AUTH_PROVIDER` is an enum (`mock` or `firebase`) and defaults to `mock` in
development; production must explicitly select `firebase`. `FIREBASE_PROJECT_ID`
is required in Firebase mode. As in Principia, the API also accepts
`FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY` for an Admin service account.
They must be supplied together with the project ID; the PEM key can contain
literal, escaped, or double-escaped newlines. Store these values in the API's
runtime environment (or its ignored `apps/api/.env`), rather than in source.
With credentials supplied, the Admin app initializes once when the Firebase
service starts and reuses the same Auth instance for each verification. Mock
mode skips Admin initialization entirely.
Without them, it still verifies ID tokens using the explicit project ID and
public verification keys; ID-token verification alone does not require a
service-account private key. A Firebase **user ID token is not an environment
variable**: each signed-in client supplies its own token on each request.
Production verification refuses the `FIREBASE_AUTH_EMULATOR_HOST` setting,
which would otherwise allow unsigned tokens. No emulator configuration is part
of this slice.

The deterministic verifier tests exercise verified/unverified claims, wrong
audience or issuer, absent subject, malformed and expired token errors,
configuration failure, and reuse of the Admin app. Run them with:

```bash
pnpm --filter @lazyfinance/contracts build
pnpm --filter api exec vitest run src/auth/firebase/firebase-auth.service.spec.ts src/auth/firebase/firebase-auth.utils.spec.ts src/environment/environment.schema.spec.ts
pnpm --filter api exec vitest run src/auth/mock/mock-auth.service.spec.ts src/auth/http.guard.spec.ts
TEST_POSTGRES_URL=postgresql://user:password@localhost:5432/postgres pnpm --filter api exec vitest run src/auth/external-identity.integration.spec.ts
```

These verifier tests substitute the Admin SDK's verification call; they do not
represent an end-to-end sign-in against a live Firebase project. The LAZ-44
PostgreSQL integration tests inject verified identity fixtures to exercise
first and concurrent provisioning, email collisions, and cross-user financial
operations without a Firebase emulator. Run them with `TEST_POSTGRES_URL` set.

## Integrated identity verification (LAZ-45)

The UI's development and production environment files currently use the public
Web app identifiers for `lazyfinance-dev`. For a local Firebase run, migrate a
development PostgreSQL database and start the API with `AUTH_PROVIDER=firebase`
and `FIREBASE_PROJECT_ID=lazyfinance-dev` (in ignored `apps/api/.env` or the
runtime environment), then start the UI with `pnpm --filter ui dev`. Enable the
Google provider in the Firebase project and authorize `localhost` as a sign-in
domain. Production deployments must use matching UI and API project settings.
Neither a service-account key nor a Firebase Auth emulator is required to
verify ID tokens; a service-account key, if used, belongs only in the API runtime.

The PostgreSQL identity-flow test runs against the actual API controllers,
principal resolver, financial services, and a transaction that rolls back its
fixtures. Its default path injects two verified external identities for
deterministic first/repeat provisioning, rejection of missing/demo tokens,
connection ownership, and two-user account, transaction, tag, objective, income
source, expectation, and receipt isolation. A separate mock-mode test exercises
the real demo login and confirms it cannot access a Firebase user's account.
Run them with:

```bash
TEST_POSTGRES_URL=postgresql://user:password@localhost:5432/postgres \
  pnpm --filter api exec vitest run src/auth/identity-flow.integration.spec.ts
pnpm --filter ui exec ng test --watch=false
```

If `apps/api/.env` selects Firebase, set `AUTH_PROVIDER=mock NODE_ENV=test`
when running the **full** API test suite; existing mock-mode specs assume
local mock auth, while this integration spec selects its provider explicitly.

For the live path, use **two separate verified-email Google test identities**
with distinct emails (neither is the demo email). Sign each into the local UI,
and obtain that person's current Firebase **ID token** from their own
`/auth/principal` request's bearer header in the browser network panel. Set
`TEST_FIREBASE_ID_TOKEN_A` and `TEST_FIREBASE_ID_TOKEN_B` in your local shell,
not in source or a shared log, and run the same API test command with
`TEST_POSTGRES_URL`. The live test is skipped unless both tokens are set. It
uses the real Admin verifier, checks distinct stable application users and the
same two-user financial isolation, rejects the demo and a tampered token, and
rolls back any fixture data. Optionally set `TEST_FIREBASE_EXPIRED_ID_TOKEN`
to a previously valid token kept past its expiry (usually about an hour) to
verify live expiry rejection. Refresh the two active tokens before rerunning;
Firebase rotates them automatically in the browser. Do not use Google OAuth
access tokens, custom tokens, or tokens from another Firebase project.

For browser and SSR smoke checks, in separate browser profiles sign in as each
identity, reload a protected URL directly, confirm the same `userId` after
reload, and confirm neither user's accounts or income appear in the other's
profile. On logout, direct navigation to a protected route must require login;
an expired or forged `lazyfinance-session` cookie must not render protected SSR
content. The browser may re-establish a session from Firebase persistence
after an expired cookie; only a valid ID token accepted by `/auth/principal`
restores access. In mock mode (`AUTH_PROVIDER=mock`, nonproduction), seed the
demo user and verify `/auth/mock/login` works; Firebase mode rejects that
endpoint and the demo token. Logout clears local access, but an already-issued
ID token remains valid on the API until it expires (see the revocation policy
above).
