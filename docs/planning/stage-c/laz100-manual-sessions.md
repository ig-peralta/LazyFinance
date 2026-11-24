# LAZ-100 — manual session record (voice and named MCP client)

**Status:** procedure and **empty** result cells. Nothing below is execution evidence until
a tester fills a row on a recorded build. The scripted portion of LAZ-100 is in the
[run record](laz100-validation-record-2026-11-24.md); these two sessions cover the
acceptance items that a script cannot honestly claim: a human microphone and a named
external client.

Result values: `passed`, `failed`, `skipped`, `blocked`. Do not record tokens, keys,
personal financial records or raw audio.

## Session header (fill once per session)

| Field | Value |
| --- | --- |
| Date, time, timezone | |
| Tester | |
| Git commit and whether the working tree is clean | |
| Stack mode (mock auth / Firebase) and URL (local / deployed) | |
| Browser and version, OS, microphone device | |
| Model/voice provider and configured model (from `assistant.configuration`) | |
| Data class (must be synthetic) and the account used | |
| Cost/data authorization (who approved, spending limit) | |

## Live voice (LAZ-100 criterion 2)

Contract: [native conversational voice](../../technical/assistant-live-voice.md). By design
native voice **does not create an input transcript** (input transcription is disabled and
no audio is stored); the voice stage exposes sources and **Ver consultas** instead. Record
what is observed against that contract rather than expecting a spoken-text transcript.

Open the assistant, accept the processing disclosure, then start voice. Ask the question
in Spanish and compare each figure with the same figure read from `/cuentas`,
`/dashboard` or the API.

| ID | Check | Expected | Observed | Result |
| --- | --- | --- | --- | --- |
| VO-01 | Microphone permission prompt appears only after an explicit start; allow it | Capture starts only after the explicit action; the stage shows listening | | |
| VO-02 | Ask "¿Cuál es el saldo de mi cuenta corriente?" | A short spoken answer; the amount equals the account service; **Ver consultas** lists the evidence | | |
| VO-03 | Ask for the month's spending | Amount equals the monthly summary | | |
| VO-04 | Interrupt the answer mid-sentence by speaking | Playback stops promptly; the old response is not completed; the session stays healthy | | |
| VO-05 | Ask for a change ("crea una etiqueta ...") and answer "sí" aloud | A review card appears; **nothing is saved by speech**; only the visual exact approval changes data | | |
| VO-06 | Mute, then unmute | Muted state is visible and no audio is captured while muted | | |
| VO-07 | End the session, then continue in text | Capture stops; the text chat works; no voice content is imported into it | | |
| VO-08 | Deny the microphone permission on a fresh profile | A clear fallback to text; no error leaking vendor details | | |
| VO-09 | Switch input device or disconnect it during a session | The session ends or recovers visibly; text remains available | | |
| VO-10 | Drop the network during a session | The session ends without replaying tools; the user can start again or use text | | |
| VO-11 | Sign out (or switch owner) during an active session | Capture stops; late events are ignored; the next owner sees nothing from it | | |
| VO-12 | Check provider spend for the session | Record the observed cost; confirm it is within the authorized limit | | |

## Named external MCP client — Claude Code (LAZ-100 criterion 4)

Client: **Claude Code** (CLI), configured through the repository's `.mcp.json` as an HTTP
server `lazyfinance` at `http://localhost:3000/mcp` **without** a static `Authorization`
header, so the client performs the OAuth 2.1 + PKCE flow itself. The scripted OAuth client
in `laz100-mcp.mjs` is generic and does not count as this session.

Steps for the human tester (the consent and revocation steps are interactive):

1. Start the stack in mock-auth mode with the demo seed.
2. In Claude Code run `/mcp`, select `lazyfinance`, choose **Authenticate**, and review
   the consent screen in the browser. Approve **read-only** first.
3. Ask Claude Code to read balances and the monthly summary through the `lazyfinance`
   tools and compare them with the app.
4. Revoke from `/aplicaciones-conectadas`, confirm the next call fails, then re-authenticate
   (recovery path). Repeat once ticking the optional tag-write permission and ask for a tag
   to be created; confirm it is created once.
5. Record the Claude Code version (`claude --version`) and which of the combinations below
   were **not** exercised.

| ID | Check | Expected | Observed | Result |
| --- | --- | --- | --- | --- |
| NC-01 | Discovery and OAuth start from `/mcp` without a static token | Client follows the 401 challenge, registers dynamically and opens consent | | |
| NC-02 | Consent shows the client name, "identidad no verificada", scopes and expiry | Legible; read-only is the default; write is an opt-in checkbox | | |
| NC-03 | Read balances and a monthly summary | Figures equal the app and the database | | |
| NC-04 | Recognizable client display in `/aplicaciones-conectadas` | Name and capabilities legible; a logo (if any) grants no trust | | |
| NC-05 | Renewal after the access token expires, or after forcing a refresh | The client renews silently; reuse of an old refresh token is not attempted | | |
| NC-06 | Write attempt under a read-only grant | Refused with a permission message; nothing changes | | |
| NC-07 | Write under a grant with the tag-write box ticked | Tag created once; a repeated request does not duplicate | | |
| NC-08 | Revoke the grant in the UI | The next call fails; other grants are unaffected | | |
| NC-09 | Re-authenticate after revocation | New consent is required and then access works | | |

Unverified client/deployment combinations (list them here): deployed (HTTPS) environment,
Claude Desktop, claude.ai connector callback (`https://claude.ai/api/mcp/auth_callback`),
any other client.
