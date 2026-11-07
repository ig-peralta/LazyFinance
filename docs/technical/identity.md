# Provider-neutral identity and application ownership

An identity provider authenticates an external subject; LazyFinance's internal
application user owns the financial data. Those identifiers are deliberately
separate. This boundary lets different authentication providers fit the same
principal, persistence and ownership model without teaching every financial
service about a provider SDK.

See [RPC/RLS security](persistence-security.md) for signed service contexts and
bootstrap privileges, [database relationships](database-model.md) for stored
mappings, and [UI/session lifetimes](ui-data-lifecycle.md) for browser/SSR races.

## External identity versus application principal

A **server-side verifier** produces the shared `VerifiedExternalIdentity` contract:

```ts
{
  provider: "<provider namespace>",
  issuer: "https://<trusted issuer>",
  providerSubject: "<stable subject within that issuer>",
  verifiedEmail: "<verified address or null>",
  displayName: "<display name or null>"
}
```

`(provider, issuer, providerSubject)` is the stable mapping key, not an email,
browser-supplied UUID or display name. The issuer separates subjects from different
projects/authorities even when their subject strings happen to match. Parsing
this shape with Zod is **not authentication**; the browser must never submit it
as proof that it controls the subject.

The resolved `AuthPrincipal` is `{ userId, email, name }`, where `userId` is an
internal UUID. Financial services, public RPC, MCP and private user context use
that UUID. They neither store a bearer token on the user nor treat an external
subject as a financial owner. Identity providers and banking-data providers are
different boundaries; changing a bank adapter does not change who owns an account.

## Multiple provider namespaces, explicit runtime selection

The identity contract and mapping table are provider-neutral. The table permits
different provider/issuer namespaces to reference one application user, with at
most one mapping per `(user_id, provider, issuer)`. This representational capability
does **not** implement cross-namespace account linking or merging: current
onboarding creates a new user for a new verified subject or resolves an existing
explicit mapping. Firebase credential linking below keeps one existing UID; it
does not add another external-identity mapping.

The currently implemented API modes are:

| `AUTH_PROVIDER` | Verification | Mapping behavior |
| --- | --- | --- |
| `firebase` | Firebase Admin verifies a Firebase Auth ID token against the configured project/issuer/audience | Resolve by Firebase UID; provision a new application user only with verified email |
| `mock` | Local hardcoded demo credentials/token; issuer `https://mock.lazyfinance.cl`, subject `demo` | Existing seeded mapping only; never create a replacement demo owner |

**One mode is selected per API process.** The UI reads `auth.config` and presents
that mode's login. This is multi-provider-ready identity modelling with two
implemented verifiers, not simultaneous arbitrary provider login, an automatic
plugin registry, or email-based federation. The current real-provider browser
flows are Google and email/password through Firebase. These are **sign-in methods
within the `firebase` namespace**, not additional `AuthProvider` values. The
Firebase UID, not `firebase.sign_in_provider`, an email, a raw Google OAuth subject
or access token, is the verified subject used by that adapter. A token from the
unselected mode is not a fallback credential.

## Authentication and atomic resolution

1. A client sends its credential as `Authorization: Bearer <token>` to protected
   public RPC/MCP. An SSR cookie is not accepted directly as API authentication.
2. `AuthService` selects the configured verifier. It validates credentials before
   producing the provider-neutral identity; callers cannot choose their owner.
3. The API signs a short-lived **identity-bootstrap** context containing that
   verified identity and a request UUID, and calls private `identity.resolve`.
4. The restricted database function locks the external mapping key, resolves an
   existing user or atomically inserts the user/mapping. Concurrent first sign-ins
   for the same subject resolve to one user.
5. Domain operations use the resulting principal. The API signs separate **user**
   contexts for financial persistence; RLS checks that internal UUID and every
   related owner.

Email is required and verified only for first provisioning; it is not authority
to access another user. A collision with any existing case-insensitive email,
including the demo user's, fails with a conflict rather than linking accounts.
An existing subject can still resolve when a later token has no verified email.
Changed email/display name does not remap that identity or automatically rewrite
the stored application profile. Mock resolution is existing-only, and production
refuses mock mode entirely.

The bootstrap context can call only the narrow resolver, not finance procedures.
Its `SECURITY DEFINER` owner has no financial access and cannot be assumed by the
runtime. A normal user context cannot call bootstrap. These restrictions preserve
ownership without introducing a general system/admin bypass.

## Firebase sign-in and credential linking

The browser offers Google sign-in, password sign-in/registration, email
verification resend/recheck, and Firebase password-reset emails. Passwords go to
the Firebase Web SDK, not to LazyFinance's API or database. Password inputs are
cleared on submission; the app does not persist passwords or pending OAuth
credentials. Firebase owns password storage, email action links and credential
validation.

Creating a password account signs into Firebase and sends a verification email,
but does **not** accept a LazyFinance principal, provision through `auth.principal`
or write an SSR token cookie. A verified email is required for first internal-user
provisioning. Rechecking verification reloads the Firebase user, forces a new ID
token and verifies it through the API before entering the app. If sending the
email fails after creation, the Firebase account still exists: resend verification
or sign in again rather than assuming creation rolled back. Existing mapped
subjects retain the resolution behavior described above, even if a later token
lacks verified-email evidence.

The authenticated `/seguridad` page ("Acceso y seguridad") displays the current
Firebase methods and offers explicit, same-account linking:

| Current method | Adding a method |
| --- | --- |
| Google, no password | Use the current verified Firebase email, enter/confirm a new password, reauthenticate with Google, then call Firebase `linkWithCredential` on that user |
| Password, no Google | Reauthenticate with the current password and verify a fresh token with the API; click a separate button to call `linkWithPopup` on that user |
| Both | Display both as connected; no unlink, password-change or merge command |

The separate Google button preserves the popup's user gesture instead of opening
it after an asynchronous password check. Its in-memory proof is UID/internal-owner
bound, single-use and expires after five minutes; expiry is checked at use, not
just by the UI hint. After linking, the browser forces a fresh token and requires
the API to resolve the **same internal user UUID**. A UID/owner change fails
closed. No finance procedure, data migration or ownership update is part of linking.

Credential collisions stop the flow. The app neither signs into the other account
to copy data nor deletes/reassigns either identity. A sign-in collision directs
the person to use their existing method and link from security settings; it does
not enumerate registered methods or store/replay the failed OAuth credential.
Separately created Firebase UIDs are not merged, even if emails match. Firebase's
own trusted-provider/account-per-email policies can affect sign-in behavior; the
app always maps the UID Firebase actually authenticates, never an email inferred
from an error. Reset requests use generic confirmation, including a missing-user
response, but full enumeration protection still requires Firebase configuration.

These checks protect the application flow and asynchronous session handling;
they are **not** a separate server-enforced MFA or recent-authentication policy.
Either connected method can sign into the account on its own. In particular,
adding a password does not inherit Google account MFA. Firebase credentials,
email recovery, browser/XSS protection and project policy remain security
boundaries; Firebase's email recovery behavior is separate from the page's
reauthenticated linking flow. Client cancellation cannot undo a link already
confirmed by Firebase;
see [command lifetimes](ui-data-lifecycle.md#firebase-commands-and-observer-ordering).

## Sessions across browser and SSR

The browser verifies its candidate token through `auth.principal` before accepting
a principal. Firebase mode lets its browser SDK own token persistence/refresh;
mock mode restores the configured demo token. Both hand off only `{ token }` in
the `lazyfinance-session` cookie, never a trusted serialized user.

Every SSR render revalidates that token through the API before protected content.
The cookie is JavaScript-readable, SameSite=Lax and Secure on HTTPS, not an
HttpOnly server session. Forged/expired cookies cannot supply identity. Accepted
credentials own cancellation lifetimes; late verification failures/401s cannot
replace or expire a newer session. Protected resources are not serialized into
hydration transfer state. The browser verifies its own current identity and
refetches after hydration. Details live in the
[session/resource reference](ui-data-lifecycle.md).

Logout clears local access and the handoff cookie; it is not a general upstream
credential-revocation operation. In the current Firebase verifier,
`verifyIdToken` checks expiry/signature/claims but does not request immediate
revocation checking by default. An issued token may remain usable until expiry.
Additional providers need an explicit lifetime/revocation policy, not an assumed
shared guarantee.

## Configuration boundaries

| Setting | Scope |
| --- | --- |
| `AUTH_PROVIDER` | API mode, default `mock` for development; production must select `firebase` |
| `FIREBASE_PROJECT_ID` | Required by the current real-provider verifier; establishes expected audience/issuer |
| `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY` | Optional paired API-only Admin credentials; ID-token verification can use project ID and public verification keys without a service-account private key |
| UI `environment*.ts` | Public Firebase Web identifiers and browser API URL; must match the selected project's API configuration |
| Service signing/private database configuration | Separate API/persistence credentials, described in the [manual](technical-manual.md#environments) |

Both UI environment files currently use the public `lazyfinance-dev` Web project.
Google and Email/Password sign-in must be enabled and the browser domain
authorized in that project. Review email templates/action URLs, password policy,
email-enumeration protection and account-per-email settings before deployment;
see the [Firebase setup checklist](technical-manual.md#firebase-browser-setup).
Admin credentials, service signing keys and user tokens never belong in the UI
bundle or committed examples. Production rejects `FIREBASE_AUTH_EMULATOR_HOST`;
there is no emulator-based production authentication path. Mock needs neither
Firebase nor an emulator, but requires the explicit demo seed.

## Extending identity without coupling financial code

To support another provider:

- Define its trusted issuer/audience, stable subject, accepted credential type,
  email-verification evidence, expiry/revocation rules and failure behavior.
- Add a server verifier that returns `VerifiedExternalIdentity` only after those
  checks. Extend API configuration/selection and the public `AuthProvider`/login
  contract deliberately; an arbitrary `provider` string is not sufficient.
- Add the appropriate browser/server credential flow without changing the
  internal `AuthPrincipal` or allowing client-proposed user scope.
- Specify explicit ownership-safe linking/recovery if required. Never merge
  people by matching email. Current linking covers only Google/password methods
  under one Firebase UID, not arbitrary namespaces, unlinking or cross-UID merges.
- Verify first/repeat/concurrent resolution, issuer separation, collisions,
  rejected credentials, two-user isolation and obsolete-session races.

External MCP-client authorization remains a separate capability. A future client
grant/token must resolve to the same internal user with its own permissions and
expiry/revocation rules; it must not be mistaken for a Firebase ID token or choose
a different financial-owner convention. Shared/family/organization ownership is
also not supplied by having multiple identity namespaces.

## Verification scope

Mocked-verifier and UI in-memory checks are not live-provider authentication.
PostgreSQL integration checks cover atomic mappings and ownership using trusted
identity fixtures; HTTP/MCP/DB checks can open listeners. An optional live Firebase
case uses two distinct verified-email test users and current ID tokens, and skips
without those tokens. See [verification tiers](development-workflow.md#verification-tiers)
for isolated `_test` databases, test variables and service-starting commands.
No guide treats a passing mock test as production-provider or revocation evidence.
