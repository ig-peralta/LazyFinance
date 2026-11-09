# External MCP authorization (LAZ-27)

This records the LAZ-52 decision, LAZ-54 authorization flow, LAZ-55 enforcement and
LAZ-53 reference-client verification. Implementation and protocol fixtures are not
evidence that every named client or a production deployment has been verified.

## Decision: standards first, compatibility by evidence

Implement one OAuth authorization server profile, not separate authentication
schemes for ChatGPT, Claude, OpenCode or another client. Keep the existing eleven
Spanish read-only financial tools and their calculations unchanged.

The baseline is the published [MCP authorization specification](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization),
reviewed 8 November 2026. Authorization compatibility is separate from the MCP
message/transport revision negotiated by the existing server. Do not claim that
implementing OAuth alone verifies that transport against the July 2026 revision.
The server/core SDK is upgraded to 2.4.0 and the Node transport to 2.1.2 for current
MCP isolation/resource-limit fixes. The Nest adapter creates a fresh server and
transport for each stateless request; colliding JSON-RPC IDs are covered by a
two-owner concurrent test. The reference SDK run still explicitly uses legacy
negotiation; this is not a complete modern-transport conformance claim.

| Candidate | Decision |
| --- | --- |
| Pass a Firebase ID token or the development bearer to an agent | Reject: authenticates a person but supplies no independent client consent, resource audience or revocable client grant. |
| API keys/personal access tokens only | Reject as the primary flow: weak discovery/consent interoperability; not a replacement for MCP OAuth. |
| Managed OAuth authorization server | Valid future deployment option. It needs a separately configured provider and a verified mapping to existing Firebase/application ownership; never match owners by email. |
| Hand-written authorization code/token protocol | Reject: do not recreate protocol parsing, PKCE, client authentication or rotation when a maintained implementation exists. |
| Configured `oidc-provider` with Firebase-backed interaction and persistent state | Choose for this implementation. Use the maintained protocol implementation, disable development interactions, pin the dependency and test the application-specific policy/storage boundaries. |

## External protocol profile

- Publish RFC 9728 protected-resource metadata and a discoverable
  `WWW-Authenticate` challenge. The canonical resource is the configured public
  MCP URL; never infer its audience or issuer from an incoming Host header.
- Publish RFC 8414 authorization-server metadata and the provider's OIDC discovery
  document. Advertise only implemented endpoints, scopes, authentication methods
  and registration features. Return the exact issuer in authorization responses
  and advertise RFC 9207 issuer-identification support.
- Require authorization code flow with PKCE **S256**, including confidential
  clients. Reject implicit, password and client-credentials grants. Require the
  intended resource at authorization and token exchange and reject other resources.
- Support **Client ID Metadata Documents (CIMD)**, the current preferred discovery
  mechanism, with exact metadata/client-ID validation. Retain dynamic client
  registration (DCR) for earlier clients, plus reusable registered credentials.
  No hostname-specific authentication exceptions or bearer bypasses.
- Validate HTTPS redirect URIs exactly. Allow only documented native loopback HTTP
  redirects, with RFC 8252's variable-port exception but no wildcard host/path/query
  matching. Display the actual redirect hostname and a loopback warning at consent.
- Preserve the provider's SSRF-resistant DNS/connection handling for CIMD/JWKS
  fetches. Bound response bytes/time and caching. Never replace its secure fetch
  dispatcher with an unrestricted production fetch or follow unsafe redirects.
- Advertise `finance:read` as the protected resource's required permission. It
  covers the existing financial read tools and permits no writes. Identity and
  offline scopes, if exposed by the authorization server, do not authorize a tool.
- Issue opaque ten-minute access tokens, single-use sixty-second authorization
  codes, rotating refresh tokens and a maximum 30-day grant. Refresh-token reuse revokes the grant
  family; replay prevention must be atomic under concurrent requests.

## Identity and consent

Firebase continues to authenticate the person through the existing application
flow. Server verification resolves the existing `AuthPrincipal.userId`; this
internal UUID, never an email or client-supplied owner, becomes the OAuth account.
An MCP access token is not a Firebase credential and cannot authorize public
financial management RPC. Conversely, Firebase/development tokens are not external
MCP grants.

The first-party `/autorizar-mcp?interaction=…` interaction displays the authenticated account, client identity,
callback hostname and read-only capabilities. Client names from registration are
claims, not an endorsement. Approval and denial are explicit and bound to the
provider's browser interaction; cancellation, account replacement and ambiguous
responses never automatically replay approval. Do not enable the provider's
example username/password views or accept an account ID from an interaction body.

Each grant has one immutable owner, client and resource. Show owned grants and an
explicit revoke action at `/aplicaciones-conectadas`. Revocation ends that grant's
access and refresh credentials without disconnecting a bank or changing financial
records, Firebase methods or another client's grant. App logout is not implicit
external-client revocation. Already-running requests need not be cancelled, but
new requests after confirmed revocation must fail.

## Persistence and process boundaries

Only persistence accesses PostgreSQL. OAuth server artifacts cross signed private
RPC with a dedicated `mcp-authorization` purpose restricted to named OAuth-state
procedures; it has no user assertion and no financial-table RLS access. It is not
a general system/administrator context. Normal user contexts cannot invoke those
OAuth-state procedures or read another owner's grants.

Provider artifacts use an explicit model allowlist, SHA-256 lookup IDs and
AES-256-GCM payloads bound to the model/key. HKDF separates artifact encryption
and cookie signing from the OAuth master secret. Expiry and atomic consumption are
stored separately so concurrent upserts cannot resurrect used codes or refresh
tokens. Approval and denial atomically claim the same interaction before making a
decision. Per-grant locks coordinate consumption, token writes and revocation;
rejected replay results commit family revocation before the adapter reports an
OAuth error. A separate owner-bound grant record controls resource access and settings
revocation. An unbound or partly completed provider grant confers no financial
access. Its owner/client/resource/expiry are immutable through runtime grants;
revocation cannot be cleared. Output validation completes before each private
transaction commits.

Use a new OAuth-only state-encryption/cookie secret and stable private signing JWKS; never
reuse banking encryption material or internal service assertions as OAuth tokens.
Do not modify existing local environment files, keys or application data during
implementation. New migration 027 must be tested on disposable databases before
any separately authorized application-database upgrade.

The OAuth library may run in the API process initially. Keep its persistence
adapter, interaction bridge and MCP resource verifier separate so an external
authorization server can replace it without changing financial service identity.

## Configuration and operations

1. Back up the current-schema database and review migration **027** before applying
   it with the owner-only migration CLI. It adds only OAuth tables, indexes,
   constraints, policies and a revocation trigger. It does not rewrite finance
   records, bank connections, identities or keys. Re-provision/verify the existing
   restricted runtime login; never give the API owner/database credentials.
2. Run `pnpm mcp:keys` in a private terminal. It prints independent, newly generated
   `MCP_OAUTH_STATE_KEY` and `MCP_OAUTH_JWKS` values; it writes no file and rotates
   nothing. Keep both stable, API-only and backed up with the database.
3. Configure all four: `MCP_OAUTH_ISSUER`, `MCP_OAUTH_UI_ORIGIN`,
   `MCP_OAUTH_STATE_KEY`, `MCP_OAUTH_JWKS`. The issuer/UI values are canonical
   origins, with no trailing slash, path, query or credentials. The protected
   resource is exactly `${MCP_OAUTH_ISSUER}/mcp`.
4. Use HTTPS in production. HTTP is accepted only for explicit development
   loopback origins. Host both UI and API on the **same browser site** so the
   HttpOnly, SameSite=Lax OAuth interaction cookies reach the API. Local examples
   must not mix `localhost` and `127.0.0.1`. The UI's compiled API URL must match
   the issuer; first-party RPC CORS still needs the UI origin in `CORS_ORIGINS`.
5. `MCP_OAUTH_TRUST_PROXY=true` is only for a trusted TLS reverse proxy that
   strips/replaces incoming forwarded headers. Restrict direct backend access.
   OAuth routes reject any effective request origin other than the configured
   issuer with 421; aliases are not alternative issuers. Leave proxy trust off
   for direct loopback use. The configured UI origin alone gets credentialed
   interaction CORS; public discovery/token/MCP CORS does not allow credentials.
6. Add deployment-side rate limiting and abuse monitoring before public exposure,
   especially for unauthenticated registration/authorization. Storage is bounded
   to 100,000 artifacts and 50 live grants per owner, with incremental expired-row
   cleanup. Client registrations have no automatic expiry; this is not a complete
   registration-abuse, audit-retention or distributed admission policy.

The 8 November 2026 production-dependency audit is **not clean**: after the MCP
SDK fixes it still reports 1 critical, 9 high, 13 moderate and 2 low findings in
the existing framework/validation/Firebase/tooling dependency tree. In particular,
triage `proxy-addr`, Nest microservices, `body-parser`, `multer`, Zod, gRPC and
source-map advisories before public deployment. This OAuth delivery does not
claim to remediate that unrelated dependency backlog or establish production
hardening. Do not infer a safe public rollout from passing functional tests.

The Nest bridge deliberately uses `oidc-provider`'s supported **parsed-body
fallback**, allowing explicit resource checks before protocol dispatch. OAuth JSON
and form bodies are bounded to 56 KiB and repeated form values remain arrays, not
silently selected values. The library can emit its upstream-body-parser warning;
this is a reviewed integration choice, not proof that its raw-stream parser ran.
Other public JSON retains the existing 1 MiB limit. External CIMD/JWKS fetches use
the library's public-address-pinned dispatcher, 2.5-second abort and configured
16/32 KiB response limits; the injectable fetch seam does not remove that dispatcher.

**Breaking change:** Firebase ID tokens and development application bearers no
longer authenticate `/mcp`. Without the complete OAuth configuration the endpoint
rejects access; it does not fall back to first-party auth. Existing first-party
tRPC auth is unchanged. OAuth credentials cannot call first-party management RPC.

An application/API restart with unchanged secrets restores registered clients,
grants and credentials from persistence. Rotating the state key without a planned
migration makes existing encrypted artifacts/cookies unreadable; do not treat it
as routine restart configuration. JWKS replacement also needs a key-overlap and
client-validation plan. Migration 027 deliberately refuses `down`: first disable
external issuance, explicitly revoke affected grants and choose a recovery or
forward-fix plan. Rolling back application code to a version that accepts app
bearers at `/mcp` is not a secure OAuth rollback; block that endpoint at ingress.

## Connecting clients

Configure an HTTP MCP server URL of `https://<issuer-host>/mcp`, not `/trpc` or an
OAuth endpoint. A conforming client follows the 401 resource-metadata challenge,
discovers the authorization server, chooses CIMD/DCR/reused registration, opens
the browser and requests `finance:read`. Authorization and token/refresh requests
must include that exact MCP resource. Native and confidential clients both need
S256 PKCE; a client secret does not replace PKCE.

For preconfigured credentials, register once using the standard DCR endpoint and
store its client ID/secret privately in the client. Reuse those credentials on
subsequent connections; registration itself authorizes no financial data. Public
clients use `token_endpoint_auth_method: "none"`. Confidential clients may use
`client_secret_basic`, `client_secret_post` or `private_key_jwt` with registered
JWKS. Use exact HTTPS callbacks or native loopback callbacks; never add a wildcard
redirect to accommodate a client. No private credentials belong in a browser app.

OpenCode V2 documents a remote URL with automatic OAuth, preferred CIMD and
fallback DCR/reused credentials. ChatGPT/Codex document CIMD/DCR and product-specific
hosted callbacks. Claude connectors document discovery, DCR/preconfigured secrets,
PKCE, refresh and the HTTPS callback `https://claude.ai/api/mcp/auth_callback`;
other Claude products/API supplied-token mode must not be conflated with that
interactive flow. Follow each product's current source linked below. No existing
client configuration is changed by these instructions.

Example outcomes:

- **Approve:** discover → S256 authorization with `resource` → browser sign-in →
  verify account/client/callback → approve → code+state+`iss` callback → exchange
  code with verifier/resource → call owned financial tools.
- **Deny:** explicit denial returns `access_denied` to the registered callback;
  no grant or financial access is created. Closing a browser is not approval.
- **Expired access:** renew with the rotating refresh token and resource; do not
  replace it with a Firebase token. Reusing an old refresh token revokes the family.
- **Revoke:** confirm in connected apps (or use authenticated RFC 7009 revocation);
  future MCP requests fail with 401 and refresh fails. Reconnect requires new consent.
- **Reject:** wrong audience/client/owner, expired/unbound/revoked credentials,
  bad PKCE/callback or forged consent never select another owner. A valid token
  without `finance:read` gets 403 `insufficient_scope`, not financial output.

## Compatibility and verification matrix

No application is labelled supported merely because its documentation looks
compatible. Record exact tested versions, registration path, callback policy,
discovery, consent, tool results, refresh, revocation and two-user isolation.

| Target | Evidence required | Current evidence |
| --- | --- | --- |
| Official TypeScript MCP client 2.4.0 | OAuth discovery/DCR, browser consent, owned tool call, refresh and revocation | Automated real-RPC/PostgreSQL run; legacy MCP transport negotiation |
| OpenCode V2 2.2.5 | CIMD/native loopback and documented DCR/pre-registered alternatives | Local browser authorization and an actual financial tool call passed; after per-grant revocation the next call returned `Connection closed` and the client disconnected. Manual HTTP status and refresh were not captured; native CIMD fixtures and SDK lifecycle tests provide separate protocol evidence. |
| ChatGPT / Codex | CIMD or DCR, issuer response and exact hosted callback; real public HTTPS endpoint and account access | Documentation/ChatGPT public CIMD reviewed; private-key-JWT/CIMD fixtures pass; hosted products not verified |
| Claude connectors | Discovery, DCR/preconfigured credentials, PKCE and refresh; distinguish interactive connectors from API supplied-token usage | Current authentication documentation reviewed; standard DCR/confidential fixtures pass; hosted products not verified |
| Other conforming HTTP clients | Standard discovery, public/confidential client authentication and recorded transport compatibility | Not verified |

Tests must reject missing, invalid, expired, wrong-resource, revoked and
insufficient-scope credentials on MCP POST/GET/DELETE. Test forged/foreign consent,
bad PKCE, redirect mismatches, code/refresh replay, concurrent consumption, owner
changes, persisted restart/revocation behavior and cross-user financial IDs. Keep
tool metadata/output schemas and exact monetary/calendar semantics unchanged.

Use ephemeral/non-default listeners and disposable PostgreSQL only. Do not expose
the development stack publicly or start a tunnel without separate authorization.
Mocked protocol tests do not prove live Firebase or a hosted third-party connector.

### Reproducing the automated reference run

With an already-created, explicitly disposable PostgreSQL 18 `_test` database:

```sh
TEST_POSTGRES_OWNER_URL=postgresql://owner:password@127.0.0.1:5432/disposable_test pnpm test:integration
```

The existing runner builds/migrates/provisions and starts compiled persistence on
an ephemeral loopback port. `apps/api/tests/integration/mcp/` obtains real OAuth
grants through signed private RPC; `oauth-reference-client.integration.spec.ts`
uses the official SDK 2.4.0, not a hand-written client impersonating it. Sign-in is
a trusted mock verifier for isolated test users, not live Firebase. CIMD/JWKS
compatibility suites inject offline HTTPS metadata responses, not hosted clients.
The runner stops its service but does not create/drop the target database. Run the
separate persistence integration suite for SQL/RLS/migration coverage and the UI
one-shot suite for consent/revocation session races; see [verification tiers](development-workflow.md#verification-tiers).

### Recorded local verification — 8 November 2026

| Check | Result and limits |
| --- | --- |
| Full API unit/integration suite | 444 passed across 69 files; 1 live-Firebase case skipped without test tokens. Real signed private RPC and disposable PostgreSQL; two workers for the final full run. |
| Persistence unit / SQL integration | 63 unit tests and 31 PostgreSQL integration tests passed. Includes purpose isolation, every protected table, atomic consumption/replay, monotonic revocation, rollback and migration policy. |
| UI one-shot suite | 363 tests across 47 files passed, including obsolete owner/interaction responses, duplicate actions and uncertain revocation. |
| Official SDK / compatibility fixtures | SDK 2.4.0 DCR/discovery/consent/read/refresh/revoke; offline CIMD/native variable-port and confidential-auth profiles; rejected metadata, replay, expiry and two-owner colliding JSON-RPC IDs. Not live named-client verification. |
| Chromium browser | Production browser output with only an in-memory test API-URL substitution; mock sign-in, real OAuth/RPC/database. Approval/denial, owned balance agreement, explicit revoke, keyboard focus return and foreign-browser rejection passed. No page errors or detected WCAG A/AA axe violations on the two pages; no horizontal overflow at widths 320/390/768/1440. |
| Current-schema upgrade | Disposable 026→027 upgrade preserved all rows and existing grants/RLS across the 24 prior application tables, including fixture bank credentials/checkpoints. Destructive downgrade was rejected atomically. |
| Compiled API bootstrap | Normal `main` started on non-default ports with OAuth disabled and enabled, without database/provider requests. Root liveness and unauthenticated MCP rejection passed. |
| Static/build/contracts | Workspace build, typecheck, RPC drift, architecture, format and lint checks passed. Build retains initial-bundle-budget/CommonJS warnings; lint reports 29 warnings and 10 infos. The parsed-body warning is disclosed above. |
| Secret/resource audit | Tracked diff plus all untracked source checked against local private credential values without printing them; no matches. Test listeners/databases and browser-only login roles cleaned up. The existing review database remained at migration 026; no OAuth tables were added there. |

These results are not production, public-HTTPS, live-Firebase, hosted-client,
container-image or load-test evidence. The non-zero dependency audit above remains
a separate public-rollout concern. No tunnel, hosted connector or existing client
credential/configuration was created or changed for this verification.

### Development consent cache regression — 8 November 2026

A later check reproduced the consent error against the already-running Angular
development server. Its cached `@lazyfinance/contracts` bundle lacked the new
consent schemas even though the rebuilt package exported them. The resource
threw `Cannot read properties of undefined (reading 'parse')` before sending a
consent-details request; this was not evidence of an expired interaction or a
missing cookie.

The dev server now bundles the mutable workspace contracts and their Zod runtime
with application code instead of prebundling them as third-party dependencies.
Restart an existing UI task once after this configuration change, reload the
browser, and begin a fresh client authorization. No database reset or OAuth key
rotation is needed.

An isolated Angular development server/cache, API and disposable PostgreSQL
verified the equivalent `localhost` browser flow using OpenCode's **live public
CIMD**, mock sign-in and an in-memory API-URL substitution. Preview, keyboard
approval, owned balance read, denial, explicit revocation and foreign-browser
rejection passed. No page errors or horizontal overflow were detected at
320/390/768/1440 widths. The ten consent/grant UI tests also passed. This verifies
the development browser setup, not the OpenCode application itself or a hosted
connector. Existing development services, data and keys were left unchanged.

### Manual OpenCode verification — 8 November 2026

OpenCode **2.2.5** connected to the local MCP endpoint through its browser OAuth
flow and public CIMD. An actual `consultar_saldos_cuentas` call through the newly
authenticated connection returned the account data. After revoking that grant in
connected applications, the next call returned `Connection closed` with no data,
and OpenCode removed the disconnected tool surface.

This records successful local authorization and a protected read, plus client-side
failure after revocation. The manual failure did not expose an HTTP status/body;
do not describe it as a captured 401 response. Refresh, expiry and two-owner
isolation remain automated SDK/protocol evidence rather than manually verified
OpenCode behavior. No account values, identifiers, browser cookies or OAuth
credentials are included in this record.

The full suites were subsequently rerun with local OAuth enabled: **444 API tests
passed, 1 live-Firebase case skipped; 363 UI tests; 63 persistence unit tests; 31
PostgreSQL tests**. The OAuth-disabled HTTP fixture now explicitly supplies its
test environment instead of inheriting local provider settings. Build, typecheck,
RPC drift, architecture, formatting and lint passed; lint retains 27 warnings and
10 infos after removing two unused test imports. Build budget/CommonJS warnings
and the deployment/dependency limitations above remain.

## Sources

- [MCP authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization),
  [client registration](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/client-registration),
  [security considerations](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/security-considerations).
- [oidc-provider configuration and adapter requirements](https://github.com/panva/node-oidc-provider/blob/main/docs/README.md).
- [OpenCode V2 MCP configuration and OAuth registration](https://opencode.ai/v2/docs/mcp-servers).
- [OpenAI MCP authentication and callback requirements](https://developers.openai.com/apps-sdk/build/auth/).
- [Claude remote MCP API overview](https://platform.claude.com/docs/en/agents-and-tools/remote-mcp-servers).
- [Claude connector authentication](https://claude.com/docs/connectors/building/authentication.md).
