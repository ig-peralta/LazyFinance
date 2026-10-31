# Firebase identity boundary (LAZ-46)

Firebase authenticates a person; LazyFinance's own `user.id` is the financial owner. The
two identifiers must not be interchangeable. This slice supplies a verifier and a
trusted identity contract, plus a local mock login path. Application-user
provisioning (LAZ-44) and browser/SSR Firebase sessions (LAZ-43) consume that
boundary in later slices.

## Initial sign-in and token contract

- The first supported production browser sign-in is **Google through Firebase Auth**.
  Enable Google sign-in for the configured Firebase project; additional providers
  need a separate product decision. The verifier checks Firebase project identity,
  not the UI's choice of sign-in method. Until LAZ-43, the Firebase login button
  is displayed but disabled.
- A first-party client sends `Authorization: Bearer <Firebase ID token>` to the
  API. This must be an ID token from Firebase Auth, not a Google OAuth access
  token, Firebase custom token, UID, or Firebase session cookie.
- `FIREBASE_PROJECT_ID` is the expected Firebase project. The Firebase Admin SDK
  verifies signature, lifetime, and token claims. In particular, the audience
  must equal that project ID and the issuer must equal
  `https://securetoken.google.com/<project-id>`. The verifier additionally
  checks the issuer, audience, and nonempty subject in its decoded output.
- The verifier returns `{ provider: 'firebase', projectId, providerSubject,
  verifiedEmail, displayName }`. `providerSubject` is the Firebase UID;
  `verifiedEmail` is null unless Firebase asserted `email_verified: true`.
  Neither email nor display name grants financial access. Do not accept this
  contract in a client request as proof of authentication: shape validation does
  not verify a token.
- `verifyIdToken` checks expiry but does **not** check token revocation by
  default. An already issued ID token may remain usable until it expires (usually
  about an hour); logout clears local access but is not server-side token
  revocation. Any immediate-revocation policy needs separate support and
  operational configuration.

## Application and MCP subjects

LAZ-44 will resolve the verified `(provider, projectId, providerSubject)` to a
single stable application `user.id` (UUID), provisioning it once if necessary.
The existing shared `AuthPrincipal` remains `{ userId, email, name }`, with
`userId` set to that internal UUID. Financial records continue to reference
the internal UUID. Do not automatically link an existing user based on email:
two different Firebase UIDs must never inherit one another's financial data.
An existing user may still be resolved by its subject when the token has no
verified email; first-time provisioning should require a verified email or an
explicit alternative profile policy, since `user.email` is currently required.

HTTP and MCP authorization currently read the same request principal. LAZ-52
chooses authorization for external MCP clients independently; its accepted
client token should resolve to the **same internal application user ID**, not
be treated as a Firebase ID token or substitute its own subject for `userId`.
`AUTH_PROVIDER=mock` uses a seeded demo user and a hardcoded local password.
The public `GET /auth/config` exposes only `{ provider: 'mock' | 'firebase' }`
so the UI can select the appropriate login inputs. `POST /auth/mock/login`
is available only in mock mode and returns the seeded bearer token for valid
credentials; the demo token is rejected in Firebase mode. Mock mode is refused
when `NODE_ENV=production`. LAZ-44 will connect verified Firebase identities
to the internal principal for protected requests.

## Browser and SSR session boundary

The browser will initialize the Firebase client SDK only on the client, obtain
and refresh Firebase ID tokens, and pass them to the API as bearer tokens.
The Angular SSR process must not treat the current JSON session cookie's
`user` field as a trusted principal: it is client-controlled. For LAZ-43,
the recommended server-rendered session is an HTTP-only, secure, same-site
cookie issued after verifying sign-in and revalidated on each personalized
SSR request. That server-side verification must resolve the same internal
application user; invalid/expired sessions must not render private financial
data. Firebase session cookies, if chosen for that flow, need their own
`verifySessionCookie` path and must not be passed to this ID-token verifier.
Browser hydration should reconcile against the current Firebase user and
clear state on sign-out, mismatch, or expiry. Private SSR responses must not
be shared-cached.

## Configuration and local verification

`AUTH_PROVIDER` is an enum (`mock` or `firebase`) and defaults to `mock` in
development; production must explicitly select `firebase`. `FIREBASE_PROJECT_ID`
is required in Firebase mode. As in Principia, the API also accepts
`FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY` for an Admin service account.
They must be supplied together with the project ID; the PEM key can contain
literal, escaped, or double-escaped newlines. Store these values in the API's
runtime environment (or its ignored `apps/api/.env`), rather than in source.
With credentials supplied, the Admin app initializes using that service account.
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
pnpm --filter api exec vitest run src/auth/firebase/firebase-id-token.verifier.spec.ts src/environment/environment.schema.spec.ts
pnpm --filter api exec vitest run src/auth/mock/mock-auth.service.spec.ts src/auth/http.guard.spec.ts
```

These tests substitute the Admin SDK's verification call; they do not represent
an end-to-end sign-in against a live Firebase project. Once LAZ-44 wires the
principal resolver, its integration tests should confirm two different Firebase
subjects remain isolated even with the same submitted email or user ID.
