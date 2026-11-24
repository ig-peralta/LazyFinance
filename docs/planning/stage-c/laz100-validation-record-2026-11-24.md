# LAZ-100 — scripted validation record, 2026-11-24

**Status:** executed evidence for the scripted part of LAZ-100. It is **not** a closure of
LAZ-100 and does not change the [Stage C gate decision](closure.md). Two acceptance items
remain manual and **unexecuted**: live voice with a microphone and a named external MCP
client ([manual sessions](laz100-manual-sessions.md)). Suites, safety rules and how to
rerun them are in [`tests/validation`](../../../tests/validation/README.md).

## Session

| Field | Value |
| --- | --- |
| Date | 2026-11-24, America/Santiago (suites ran between 18:44 and 19:19 UTC) |
| Build | `main` at `815a4bda` with the **untracked** `tests/validation/` suite files; no tracked-file changes |
| Stack | Local `pnpm dev` (UI 4200, API 3000, private persistence 3001), PostgreSQL 18.6 in a disposable container, Node 22.23.2, Windows 10 (10.0.19045) |
| Browser | Chrome 158.0.8127.38, headless, external Playwright |
| Identity | Mock sign-in for the assistant and MCP suites; **real Firebase Auth** (project `lazyfinance-dev`, email/password) with disposable users for the Firebase and Fintoc suites |
| Data | Synthetic demo fixture; Fintoc **sandbox** with test keys and the public sandbox credentials from Fintoc's documentation |
| Model | Provider `openai`, model `gpt-6-luna` as reported by `assistant.configuration`; not a demonstration mode |
| Authorization | Model prompts, sandbox calls and disposable Firebase users were authorized by the project owner in-session on 2026-11-24. No cost figure was recorded: the stream exposes no token counts |
| Cleanup | All disposable Firebase users deleted (verified by listing: none left); MCP grants revoked; rows owned by the deleted users remain in the disposable local database |

## Result by acceptance criterion

| LAZ-100 criterion | Disposition |
| --- | --- |
| 1. Record versions, build, identity/data, cost and authorization | **Partly.** Each result file records commit, Node, OS, PostgreSQL, Chrome, auth mode, data class and model. Firebase/Fintoc REST API versions and token cost were not captured; authorization is the owner's in-session statement above |
| 2. Live Spanish answers and real-time voice, compared with owned services | **Text done; voice not executed.** AS-01 to AS-07 below. Voice is a manual session (VO-01 to VO-12), all result cells empty |
| 3. Two-user Firebase boundaries and selected Fintoc accounts, first-link cutoff, automatic sync, relink/deselection, failure recovery | **Done on the supported test plan, with the limits listed below.** FB-01 to FB-06 and FT-01 to FT-10 |
| 4. Named external MCP client: read/write grant, display, renewal/recovery, revocation | **Scripted OAuth client done; named client not executed.** MC-01 to MC-11 use a generic client and do not satisfy "named". The Claude Code session (NC-01 to NC-09) is open |
| 5. Classify controlled, sandbox, live, skipped and unavailable separately | **Done**, see the level column. No older sandbox window or synthetic model output was reused as current evidence |

## Results

### Firebase identity — level `live`, 6 passed

| ID | Check | Result |
| --- | --- | --- |
| FB-01 | Two users resolve to distinct internal owners; the same UID resolves to the same owner on re-login | passed |
| FB-02 | Missing, malformed and tampered ID tokens → 401 with no data | passed |
| FB-03 | Tags and income reads are owner-scoped; database rows carry distinct `user_id` | passed |
| FB-04 | Cross-owner updates/archives are rejected, the owner's data is unchanged, a client-supplied `userId` is rejected | passed |
| FB-05 | UI email/password sign-in; after logout and a second user's sign-in in the same browser context nothing of the first user is shown | passed |
| FB-06 | A deleted Firebase user cannot obtain a new token | passed |

### Fintoc sandbox — level `sandbox`, 11 passed

| ID | Check | Result |
| --- | --- | --- |
| FT-01 | Real hosted widget: encrypted credential stored, no plaintext link token, nothing imported | passed |
| FT-02 | Discovery stores only `currency, externalId, name, numberSuffix, unavailableReason`; unconfirmed; nothing imported | passed |
| FT-03 | Confirming 1 of 2 accounts imports only that account; the requested window starts on the first-link Santiago day | passed |
| FT-04 | A second import leaves all previously imported movements unchanged and unique; alias kept | passed |
| FT-05 | Reading the sync status and checking the connection triggers no provider attempt | passed |
| FT-06 | Automatic synchronization with the browser closed: a successful run later than the forced due time, a new scheduler attempt, only the selected account | passed |
| FT-07 | Adding a second account catches up its movements; a manual tag survives re-import; deselecting the account that holds history keeps history and alias and rediscovery does not re-select it | passed |
| FT-08a | An unreadable stored credential returns 503 "Banking credentials cannot be opened; check server configuration"; no bank failure recorded, connection stays active | passed |
| FT-08b | A token Fintoc rejects: failure recorded as `revoked` and shown in the status, history and balances intact, further refreshes refused (409) until relink | passed |
| FT-09 | Relink recovers the rejected connection: same connection, credential version advances, selection, enrollment intent, aliases, history and first-link day retained; the failure reason and retry are cleared and the status shows no failure | passed |
| FT-10 | Disconnect preserves history, refuses further imports (409) and makes the schedule ineligible | passed |

### Assistant, text — level `live`, 7 passed

| ID | Check | Result |
| --- | --- | --- |
| AS-01 | Without accepted consent the turn endpoint answers 403 and streams nothing | passed |
| AS-02 | Accepting the disclosure is stored in the account | passed |
| AS-03 | Checking balance: 3 of 3 answers contain the account service's figure (7,227,900) and cite evidence | passed |
| AS-04 | November spending: 3 of 3 answers contain the monthly summary's figure (1,208,200) | passed |
| AS-05 | Top-tag spending: 3 of 3 answers contain the summary's figure (663,900) | passed |
| AS-06 | A non-existent dollar account is declined without inventing an amount | passed |
| AS-07 | In 3 attempts a proposed tag was never created without approval, including after a spoken-style "Sí, hazlo ahora" | passed |

Answers were in Spanish, never named the vendor or model, and took 2.5–4.4 s end to end
(9 samples, one client, development mode; not a performance test).

### External MCP, scripted client — level `controlled`, 11 passed

| ID | Check | Result |
| --- | --- | --- |
| MC-01 / MC-02 | 401 resource-metadata challenge; only PKCE S256 and the documented scopes | passed |
| MC-03 / MC-04 | Registration grants nothing; consent shows client, identity notice and permission; deny → `access_denied`, no grant | passed |
| MC-05 / MC-06 | Read-only grant lists 26 tools and returns a balance equal to the database; a valid write is refused and changes nothing | passed |
| MC-07 / MC-08 | Refresh renews and rotates and cannot widen scopes (widening → 400); reusing an old refresh token → 400 and revokes the grant | passed |
| MC-09 | Optional write permission is opt-in: unticked → the grant stays read-only and the write is refused; ticked → one tag, a replayed request id creates no second; an out-of-scope action changes nothing | passed |
| MC-10 | Revoking one grant leaves another working; the UI removes the rest; a fresh consent restores access | passed |
| MC-11 | A hostile client name/logo renders inert, loads no remote image and keeps the unverified-identity notice | passed |

## Observations

1. **Provider rejection requires a relink.** After Fintoc rejected the credential, restoring
   the stored value did not revive the connection; the product answers 409 "Reconnect this
   bank before importing" until the bank is relinked. `last_failure_at` stays as history
   after recovery while the reason, retry time and the visible status failure are cleared.
2. **Intermittent incomplete answers on write prompts.** For the prompt "Crea una etiqueta
   llamada …" the model sometimes ended with the product's "No pude completar una respuesta
   verificable" error: 1 of 3 in the recorded run and roughly half of the attempts during
   earlier development reruns. The safety property held in every attempt; the proposal rate
   is a quality signal, not a pass/fail one.
3. **Read-only write refusal is an HTTP 200 MCP error**, not a 403, for a token that has
   `finance:read` but lacks a write scope. This matches the 2026-11-22 observation; the
   [MCP guide](../../technical/mcp-authorization.md) describes 403 for a token lacking `finance:read`.
4. **Sandbox variability.** Links returned 1–3 accounts and 0–25 movements and reused
   account ids across links. A run that returned a single account made the subset cases
   `blocked`, as designed, instead of passing vacuously.
5. **Automatic sync is off by default** (`BANKING_AUTOMATIC_SYNC_ENABLED`) and the variable
   is not in `turbo.json`'s `dev` pass-through list. The suite ran it with
   `--env-mode=loose`; whether strict mode would drop it was not tested.

## What this does not show

- **Voice and a named client** are not executed (see the manual sessions).
- **First-link cutoff:** the sandbox's history starts on the link day, so exclusion of
  earlier provider history is shown only by the requested window
  (`requestedHistory.from` equals the link day), not by an observed earlier movement.
- **FT-08b** uses a token Fintoc does not know, not a naturally expired or revoked bank link.
- **Firebase:** only email/password sign-in and one project were exercised; Google sign-in,
  credential linking, password reset and Firebase Console policies were not.
- **Fintoc live behavior:** organization entitlement, update interval, billing, polling
  budget and real-bank MFA are not established by the sandbox.
- **Environment:** local stack only. The deployed development environment, HTTPS ingress and
  production images were not tested; the 2026-11-22 run and the November 21 mocked-UI QA
  report are separate, older evidence and were not reused.
- Assistant results are single-session samples of a non-deterministic model on one
  fixture, not a quality benchmark; no cost was measured.
