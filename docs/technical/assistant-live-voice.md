# Native conversational voice (LAZ-95)

## Transport and authority

The API exchanges an SDP offer at OpenAI Realtime's unified
`POST /v1/realtime/calls`. WebRTC carries continuous bidirectional audio; a
server-side WebSocket attaches to the returned call ID. No provider key or
ephemeral credential reaches the browser. Sessions are bound to the authenticated
owner, a separate owned voice conversation and an allowlisted browser origin.

Capability documentation reviewed 2026-11-11, **not live-provider evidence**:

- [Unified WebRTC](https://developers.openai.com/api/docs/guides/voice-webrtc?api=realtime).
- [Realtime server controls](https://developers.openai.com/api/docs/guides/voice-server-controls): the Realtime sideband uses `wss://api.openai.com/v1/realtime?call_id=…`, authenticated by the server.
- [Realtime conversations](https://developers.openai.com/api/docs/guides/realtime-conversations): audio input, VAD commits, manual response creation, tools, transcript events and cancellation.
- [Semantic turn detection](https://developers.openai.com/api/docs/guides/realtime-vad): low eagerness allows pauses inside a user's request instead of splitting on silence alone.
- [Call hangup](https://developers.openai.com/api/reference/resources/realtime/subresources/calls/methods/hangup).

This replaces the previous transcription → ordinary text request → literal
read-aloud adapter. Semantic VAD uses low eagerness and keeps `create_response:false` so the **server** acquires
a history lease before requesting a response to the committed **audio item**.
Separate input transcription is intentionally disabled for cost: no
`audio.input.transcription` configuration, ASR request or input-transcript handler.
Native audio is the model input and generation trigger. Automatic
interruption is enabled; local output mute/clear and server cancellation also
invalidate the old response immediately.

The API waits for sideband configuration acknowledgement before returning usable
SDP. It restores owned proposal state, but never replays saved speech. It installs
the same financial reads, proposal preparation and action-status tools, and gives each turn short,
speech-specific instructions. Financial tools execute only on the sideband using
the verified owner, never browser-supplied tool results. `AssistantTurnTools`
shares validation, result-size budgets, ownership and financial semantics with
text. There is no approval/execution/cancellation tool for the model.

`POST /assistant/voice/events` accepts only the opaque session ID. Its authenticated,
no-store NDJSON stream carries validated sources, proposals, proposal revisions, turn
completion, typed problems and listening/querying/responding states, not spoken
text. Browser data-channel events are used for local playback/interruption, not financial authority. A
second observer is rejected; stream loss ends the session, with no reconnect or
tool replay. Foreign IDs neither read nor terminate another owner's session.

## Separate voice sessions, results and approvals

The server claims/finishes the same 90-second lease policy as text, but only on
conversations persisted with `mode: "voice"`. Text admission requires `text`.
Native voice uses an immutable `Consulta por voz` lease question. New turns store
empty `text`, sources, proposals and status, with no `voice` transcription metadata.
Completion requires a completed provider response and the shared evidence check,
never a speech-to-text result. Realtime's native output-text metadata is used only
transiently for grounding; it is neither a separately requested ASR service nor
streamed/persisted speech text. Unsupported claims, incomplete responses and
interruption never confirm the spoken answer. No audio is stored.

The active provider call retains native audio context. A resumed call receives
owned action state, not transcripts or synthetic user messages. The user may need
to restate other details after resuming. Existing transcripts remain unchanged.
`voice.question`, `voice.transcriptionPending` and the private
`assistantConversations.recordVoiceQuestion` procedure remain for legacy records
only; the native runtime has no caller or delayed-transcript reconciliation path.

Tools attach observations to that voice session. Query details open on request;
native voice proposals reveal one visual review card at a time. Other saved requests
remain explicitly selectable; new turns and delayed history do not displace them.
Spoken replies favor one
or two natural sentences; exact figures, dates, review states, charts and proposal
fields remain available. **Ver consultas** on the voice stage opens its latest
observations without ending capture. Correction/barge-in cancels the old generation and
discards late tool results without ending a healthy session. Already-started
proposal preparation may have committed: it is retained as unapproved and never
replayed. If its exact saved card is attached to an interrupted voice turn, the
user may explicitly approve, edit or cancel it after reviewing its fields. This
does not validate the incomplete spoken answer. Failed turns and interrupted text
turns remain blocked; the server requires the saved action-to-turn link and
rechecks ownership, version, expiry and current financial facts.

The shared flow gathers one missing detail at a time, including a new tag's color
or explicit no-color choice. A budget/goal and its new tags form **one atomic
request**, not separate tag and objective approvals. After preparation the assistant
offers to accept the request in its card or correct it by voice or **Editar**.
Text-chat requests have their own text corrections and manual editing; switching
to text does not import voice messages or proposal context into that chat.
`corregir_propuesta_financiera` revises that same pending ID/version, preserving
unchanged fields. It cannot accept, execute, change action kind or revise an applied
or cancelled request. A new request waits until the current review is resolved.

Each native turn refreshes authoritative action outcomes from the ledger-backed
conversation projection. This includes edited approvals and older proposals
outside recent-message context. Only `applied` with results proves an action
outcome. Spoken “yes”, a changed card, cancelled/stale/expired proposals or uncertain
transport results are not execution evidence. Visual ID/version approval stays
independently authenticated and server-validated. Approval makes no extra model
call; the next exchange can acknowledge the confirmed outcome.
Successful manual approval/revision/cancellation also updates the active native
session's server instructions immediately, after persistence confirms the command.
These owner/conversation-scoped notifications are process-local, not a distributed
event bus. They do not trigger unsolicited audio or another model generation.

**Direct WebRTC is not a rendering sandbox.** A modified own browser can change
provider instructions or request its own audio. It has no server financial tool
credentials or approval authority. The normal client gates playback by the current
audio item's response metadata, but this is not a server media guardrail. A native
model can also misuse valid evidence or speak before a final validation failure.
Written receipts, source observations and incomplete-answer warnings remain
authoritative. Strong pre-playback grounding would require buffered/server-owned
media and claim validation, not prompts alone. Live spoken-number/grounding
evaluation remains a release gate.

## Interaction, consent and privacy

Text stays the default and is fully supported. Empty conversations promote voice
with a large central entry, alongside text suggestions; it opens the explicit start
disclosure and never captures automatically. Voice has a dedicated stage,
restrained decorative waveform and persistent **Silenciar / Terminar voz** controls,
including while reviewing a proposal. Ending capture leaves the separate session's
requests and query results reviewable. **Texto / Voz** switches views; returning
to text also ends capture. Returning to the voice view does not restart capture.
The waveform illustrates state, not measured microphone amplitude. Returning to
text stops capture without clearing its original draft or selected text conversation.
Text proposals stay inline; query details open only on request, while native voice
reveals proposed changes for visual review. History is a drawer, not competing
transcript blocks. Only text conversations appear there; voice messages never enter
the text transcript or text-model context. Pending voice results must reconcile
before another question or a voice resumption, matching the single owner lease.
A new voice session is blocked while a request
still needs review, so its approval controls are not silently lost.

Account processing consent precedes provider work. A separate explicit microphone
start discloses that OpenAI receives audio, recent conversation and consulted
financial context; silence can still incur processing/cost. Opening the disclosure
never requests capture. No browser speech recognition/synthesis, upload-recording
workflow, automatic microphone activation, reconnect or transcription replay.

Startup has a cancellation generation before conversation creation. Cancellation,
withdrawal, navigation, minimize/reopen, hidden tabs, owner changes and destruction
invalidate that same generation at each asynchronous boundary. Mute disables tracks,
clears pending input and silences output. End stops tracks immediately, closes
transport and requests server hangup. Navigation, hidden tabs, device loss, logout,
credential replacement and conversation replacement end voice. Text generation
may survive ordinary navigation, never hidden microphone capture.

The server checks accepted consent at admission, observation attachment, native
turn admission, tool execution and confirmed-action notifications. Withdrawal immediately stops local work and
blocks new admitted work after commit; it does not retract provider disclosures or
guarantee cross-device termination of already-admitted audio.

Visible subtitles and their toggle are removed. Input ASR and browser transcript
collection are unwired; no new input or output speech text is retained. Saved
source/proposal/status records and legacy transcripts use the existing fixed
30-day availability policy, with no voice-history browser.
Migration 033 backfills voice-only records without deleting or rewriting transcripts;
mixed legacy text records hide voice turns on text reads. There are separate
10-text/100-voice storage quotas. No audio, draft, SDP or transcript enters
browser storage, hydration or application logs. Provider retention is separate.
Deleting chat does not undo finance or delete independent receipts. Review provider
project data controls before enabling.

## Bounds, failure handling and release gates

Default disabled. API-only `ASSISTANT_VOICE_ENABLED`, dedicated key/model and a
configured non-demo text assistant are required. Initial deployment is **one API
replica**: process-local admission allows one session per owner, four globally,
and five minutes per session, including mute. Starts per owner/hour default to
three in production and twelve elsewhere; API-only
`ASSISTANT_VOICE_MAX_STARTS_PER_HOUR` can explicitly set a ceiling from 1 to 60.
Failed provider setup still consumes a start; admission rejection does not contact
the provider. Both client and server have 60-second idle bounds. Setup has a
15-second browser deadline;
sideband connection/configuration also has bounded deadlines. A native turn has a
65-second deadline, at most eight read/status calls and four proposal operations.
Only one new request can be prepared per turn; a pending completed request blocks
another new request until resolved. Source budgets match text: 24 KB each / 64 KB
per turn. Queued events, speech items, output
length and observation-stream bytes are bounded. Excesses fail closed.

Provider output has a 1,024-token ceiling per response, including tool
continuations: native audio and function arguments share this allowance. This is
not a target response length. There is no automatic retry of a truncated answer,
reconnect or separate transcription charge requested by this integration.
Shared instructions ask for short neutral Spanish without Chilean slang or a
deliberate regional accent, not repeated inability
disclaimers. `ASSISTANT_VOICE_NAME` selects `marin` (default) or `cedar`, the
provider's recommended timbres, for **new calls only**. Santiago dates and CLP
remain financial context, not an accent instruction. Pronunciation/naturalness require listening
tests; voice cannot change after audio has been emitted in a call.
This is not a security/currency quota against modified browser commands. Use a dedicated project spend limit and
alerts. Distributed durable admission and hangup recovery are required before
multiple replicas.

Admission distinguishes an existing session (`409 session_active`), temporary
capacity (`429 capacity`) and an hourly limit (`429 rate_limited`). The latter
responses include bounded `retryAfterSeconds` and `Retry-After`. The browser gates
voice retries for that interval, never text composition/sending solely because of
a voice cooldown. Setup, permission, connection and provider failures show one
centered accessible problem card, not footer copy or a misleading session-finished
heading. Retry always returns to explicit microphone start.

The observation stream drains a queued terminal `voice_error` before closing.
After asynchronous closure the browser refreshes saved state; unresolved pending
turns still block another request. `voice_warning` with `output_limit` or
`turn_unconfirmed` keeps a healthy call open, leaves the answer unconfirmed and
never retries generation. Diagnostics contain fixed categories, allowlisted
provider reasons, numeric usage and internal IDs, never raw provider errors,
credentials, SDP, financial data or speech text.

Initialization remains tracked until the provider supplies its call ID; stopped,
draining or aborted late calls are hung up. Remote hangup is requested independently
of pending history finalization. Graceful shutdown refuses new starts, waits at
most 20 seconds and makes at most three five-second hangup attempts per known call
in a drain generation. Unconfirmed IDs remain in memory with an operator warning.
There is **no crash-durable lease store**. A lost initialization response, crash,
unconfirmed hangup or exit after the deadline can leave remote processing
unconfirmed. Provider lifetime and project controls remain the fallback, not a
guaranteed application five-minute cost cap. HTTP redirects are rejected and SDP
is decoded with a 64,000-byte stream limit.

Targets, not measured SLAs: local output mute/track stop within 100 ms of a control
or barge-in; remote cancellation under 500 ms; speech-end to first relevant audio
under two seconds when no financial lookup is needed. Measure lookup response,
spoken-number accuracy and interruption fidelity separately.

Deterministic tests cover native-audio triggering/completion without ASR, ignored
transcript events, no speech-text retention/history replay, owned tool execution,
late evidence, interruption/correction, incomplete-answer recovery, duplicate calls,
approval isolation, typed HTTP admission/cooldowns and media cleanup. Mocked browser
checks do not capture a real microphone or invoke a live model. Current/previous
Chrome/Edge, Android Chrome and Safari iOS/macOS remain the target live matrix;
Firefox is best-effort pending device validation. Denied permissions, autoplay,
network/provider failure and timeouts retain text fallback.

Live provider/model/browser fidelity, latency, project usage/cost and actual remote
shutdown require **separate authorization**, synthetic owners and recorded evidence.
Implementation does not authorize real financial disclosures, microphone capture
or mutations and does not establish production readiness.

## Controlled verification — 2026-11-11

The transcription-unwiring and recovery update passed 654 UI tests, 452 API
unit/HTTP tests and 69 persistence unit tests. The 153 database-dependent API cases
were skipped without an isolated integration environment; no PostgreSQL integration
suite or live model/device test was run. Workspace build/typecheck, formatting,
RPC drift (85 public / 106 private procedures) and architecture checks passed.
Existing initial-bundle/CommonJS/style-budget warnings and 27 lint warnings / 10
informational diagnostics remain; budgets were not raised.

Mocked browser checks covered permission denial, setup failure, capacity/hourly
admission, connection loss and truncated replies in home/docked, light/dark and
320px enlarged-text layouts, plus voice/text isolation and proposal review. All
90 accessibility scans reported no WCAG A/AA violations, with no page errors or
unhandled requests. These checks used synthetic media and transport responses,
not a microphone, provider or financial mutation. Read-only runtime checks also
confirmed that legacy voice records remain stored and excluded from text history.
