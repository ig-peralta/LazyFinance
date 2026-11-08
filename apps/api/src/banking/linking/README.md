# Owned Fintoc linking (LAZ-49)

This guide covers the **connection lifecycle**, not account/movement import or
refresh scheduling. LAZ-51/LAZ-48 add separate [snapshot import/refresh and status](../fintoc/README.md).
The LAZ-62 UI exposes the available lifecycle subset in
`/conexiones-bancarias` under **Mi cuenta**, without claiming its remaining refresh
acceptance is complete. No payment or money-moving Fintoc endpoint is used.

## Configuration and migration

Apply migration `202611080025-provider-linking` to the current schema. It seeds
the shared `fintoc` provider, adds connection references/encrypted tokens and
lifecycle versions, and creates `finance.provider_link_intent` with forced
owner/related-owner RLS. Existing demo connections and financial history are not
adopted, deleted or reset.

Set these **only in the API runtime environment** (see `.env.example`):

- `FINTOC_PUBLIC_KEY` and `FINTOC_SECRET_KEY`, both test or both live.
- `FINTOC_TOKEN_ENCRYPTION_KEY`: a separate, stable random 32-byte key represented
  by 64 hex characters. Generate locally with Node's
  `crypto.randomBytes(32).toString('hex')`; do not copy its output into shared logs.

Without configuration, other app features still start and authenticated
`banking.configuration` returns `{ enabled: false }`. Partial/mixed-mode settings
fail startup. Only the public key is given to the authorized client. Link tokens
are AES-256-GCM encrypted **before private RPC**, with owner/provider/mode/link ID
as authenticated associated data. API keys and raw link/exchange tokens are not
stored in connection metadata. The encryption key is not the service-signing key
and is not sent to persistence. Back it up separately: losing/changing it makes
existing ciphertext unreadable. Managed key rotation is not implemented.

## Client contract for review

All six lifecycle procedures require the ordinary accepted user bearer and reject supplied
owner IDs. These are public tRPC, not standalone REST endpoints:

1. `banking.configuration()` returns enabled state and public Widget configuration.
2. `banking.createLinkIntent({ holderType: 'individual' | 'business', connectionId? })`
   creates a Fintoc Chile/Movements intent, persists its owner, mode and provider ID,
   and returns `{ id, publicKey, widgetToken, mode, expiresAt }`.
3. Load `https://js.fintoc.com/v1/` on explicit interaction. Create/open the Widget
   with the returned `publicKey` and `widgetToken`. Bank credentials are entered
   into Fintoc, **never LazyFinance**. Use only credentials from
   [Fintoc's test guide](https://docs.fintoc.com/guides/movements/data-aggregation-test-your-integration.md)
   in the sandbox.
4. Widget `onSuccess` supplies `linkIntent.exchangeToken`. Call
   `banking.completeLink({ id, exchangeToken })`. The backend validates the token's
   intent binding and exchanges it server-side. A Widget event alone never
   authorizes access. Do not submit a dashboard `link_token` instead.
5. `banking.connections()` lists owned summaries without tokens, ciphertext, bank
   usernames/RUTs, account numbers or raw payloads. `banking.checkConnection({ id })`
   explicitly reconciles owned access; it **does not refresh/import financial data**.
6. To reconnect, create an intent with the existing owned `connectionId` and same
   holder type/mode. Fintoc must return the **same Link ID**. The token is replaced
   while local connection/account identities and user data remain. A different
   bank/holder is not silently substituted; use a new connection flow.
7. `banking.disconnect({ id })` disables local synchronization first, then deletes
   the owned Fintoc Link, not just `active: false` (deactivation retains data access).
   Financial history remains. Remote failure or unavailable/mismatched server
   configuration still disables locally and leaves `disconnectPending: true`;
   explicit repeat reconciles deletion (`404` confirms absence). Confirmed deletion
   clears the encrypted credential. Disconnection is terminal; a later connection
   is new, not a resurrection of the old identity.

The authenticated `/conexiones-bancarias` settings page follows this flow through
the generated `ApiRouter` client. `/cuentas` separately displays stored balances
and links to those settings. Financial import/refresh controls remain unavailable in
the UI; the separate API `banking.importInitial` command does not run implicitly.
See the [UI guide](../../../../ui/README.md)
and [Widget lifetime](../../../../../docs/technical/ui-data-lifecycle.md#explicit-banking-authorization).

## Races, failures and limits

- Intents expire after 20 minutes, with at most 10 pending/processing attempts per
  owner and 100 connections. Failed/expired intent retention is currently manual,
  not a complete abuse/rate-limit system. A provider intent can be orphaned if
  creation succeeds but local registration fails; it grants no stored local access.
- Callbacks atomically claim their exact intent/hash before exchange. A completed
  replay returns the current saved connection; concurrent processing is rejected.
  Exchanges and ambiguous persistence writes are not automatically replayed.
  Check owned connections or start a fresh flow for uncertain attempts. Failure
  reporting cannot undo an actually committed completion.
- Global provider/mode/Link ID uniqueness prevents claiming a hidden foreign
  connection. Already-owned Links require explicit reconnect. Fintoc may rotate a
  token before a local rejection; that external side effect cannot be rolled back.
  Reconnect explicitly to reconcile it.
- Relink captures the credential version. Status checks, relink and disconnect
  use version checks and invalidate old sync revisions, so late results cannot
  reactivate access or commit an obsolete import. A provider token rotation already
  in flight is not undone by local cancellation/conflict.
- `active` means usable access, **not fresh bank data**. `login_required` maps to
  `expired`; inactive/missing/invalid-link access maps to `revoked`. API-key `401`
  and outages mean unavailability, not user revocation. Credential status never
  advances financial freshness/checkpoints. Webhook updates remain for LAZ-48;
  this slice reconciles access on explicit checks.
- Transport has a fixed HTTPS origin, no redirects/cache/automatic retries,
  a 20-second deadline and a 1 MiB response limit. Provider errors are sanitized.
  Never log upstream bodies, secret-bearing URLs, bearer headers or tokens.

## Verification boundaries

Client, encryption and service unit tests cover mapping, authenticated encryption
and ambiguous failures without services. The integration suite
`tests/integration/banking/fintoc-linking.integration.spec.ts` exercises actual
public auth, signed private RPC, PostgreSQL/RLS, callback replay, cross-owner
rejection, preserved identities/history and disconnect recovery with a **mocked
provider**. These tests do not establish a real Fintoc account flow.

Sandbox verification additionally requires real test keys and the hosted Widget/
exchange. Live access requires provider business/product permissions and separate
consented testing; sandbox success is not production readiness.

### Sandbox evidence — 8 November 2026

A temporary Chromium harness exercised the hosted Fintoc Widget with documented
test credentials and a disposable mock application identity through the actual
authenticated API, signed private RPC and PostgreSQL. Intent creation returned
`201`, exchange and access checks returned `200`, and the stored encrypted token
decrypted to the provider-issued credential. Repeated completed callbacks made no
additional exchange. Reconnecting the same sandbox bank/user retained the local
connection and Fintoc Link IDs, rotated the token and advanced its credential
version. Disconnect returned provider `204`, retained the local connection,
cleared ciphertext and completed remote cleanup; repeating the public disconnect
made no extra provider call. The deleted credential then returned `403`, and a
separate cleanup DELETE confirmed `404`. Only newly created disposable Links were
modified; existing provider Links were not adopted or deleted. The harness and its
temporary services were stopped after verification.

This is sandbox lifecycle evidence, not financial-import, live-bank consent,
production deployment, load testing or a delivered application banking UI.

Provider references (reviewed 8 November 2026):
[flow](https://docs.fintoc.com/guides/movements/integration-with-exchange-token.md),
[create intent](https://docs.fintoc.com/api/movements-api/linkintents/link-intents-create.md),
[exchange](https://docs.fintoc.com/api/movements-api/links/links-exchange.md),
[reconnect](https://docs.fintoc.com/guides/movements/guides/guides-reconnect-link.md),
[delete](https://docs.fintoc.com/api/movements-api/links/links-delete.md).
