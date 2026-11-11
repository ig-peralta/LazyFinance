# Native conversational voice (LAZ-95)

## Transport and authority

The API exchanges an SDP offer at OpenAI Realtime's unified
`POST /v1/realtime/calls`. WebRTC carries continuous bidirectional audio; a
server-side WebSocket attaches to the returned call ID. No provider key or
ephemeral credential reaches the browser. Sessions are bound to the authenticated
owner, an owned conversation and an allowlisted browser origin.

Capability documentation reviewed 2026-11-11, **not live-provider evidence**:

- [Unified WebRTC](https://developers.openai.com/api/docs/guides/voice-webrtc?api=realtime).
- [Realtime server controls](https://developers.openai.com/api/docs/guides/voice-server-controls): the Realtime sideband uses `wss://api.openai.com/v1/realtime?call_id=…`, authenticated by the server.
- [Realtime conversations](https://developers.openai.com/api/docs/guides/realtime-conversations): audio input, VAD commits, manual response creation, tools, transcript events and cancellation.
- [Call hangup](https://developers.openai.com/api/reference/resources/realtime/subresources/calls/methods/hangup).

This replaces the previous transcription → ordinary text request → literal
read-aloud adapter. VAD keeps `create_response:false` so the **server** acquires
a history lease before requesting a response to the committed **audio item**.
Transcription is not the model input or the generation trigger. Automatic
interruption is enabled; local output mute/clear and server cancellation also
invalidate the old response immediately.

The API waits for sideband configuration acknowledgement before returning usable
SDP. It seeds bounded saved text/voice history, installs the same financial reads,
proposal preparation and action-status tools, and gives each turn short,
speech-specific instructions. Financial tools execute only on the sideband using
the verified owner, never browser-supplied tool results. `AssistantTurnTools`
shares validation, result-size budgets, ownership and financial semantics with
text. There is no approval/execution/cancellation tool for the model.

`POST /assistant/voice/events` accepts only the opaque session ID. Its authenticated,
no-store NDJSON stream carries validated sources, proposals, captions, turn
completion and listening/querying/responding states. Browser data-channel events
are used for local captions/playback/interruption, not financial authority. A
second observer is rejected; stream loss ends the session, with no reconnect or
tool replay. Foreign IDs neither read nor terminate another owner's session.

## Shared conversation, results and approvals

The server claims/finishes the same 90-second conversation leases as text.
Native voice uses an immutable `Consulta por voz` lease question and optional
`turn.voice.question` for its readable transcription. Shared model history and
the UI use the readable question. Completion requires a transcript, a completed
provider response and the shared evidence check. Missing captions, failures or
interruption never become a confirmed answer. No audio is stored.

Tools update the same results canvas used by text. Spoken replies favor one or
two natural sentences; exact figures, dates, review states, charts and proposal
fields remain visible. Correction/barge-in cancels the old generation and
discards late tool results without ending a healthy session. Already-started
proposal preparation may have committed: it is retained as unapproved, never
replayed, and an interrupted turn cannot authorize it.

Each native turn refreshes authoritative action outcomes from the ledger-backed
conversation projection. This includes edited approvals and older proposals
outside recent-message context. Only `applied` with results proves an action
outcome. Spoken “yes”, a changed card, cancelled/stale/expired proposals or uncertain
transport results are not execution evidence. Visual ID/version approval stays
independently authenticated and server-validated. Approval makes no extra model
call; the next exchange can acknowledge the confirmed outcome.

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

Text stays the default and is fully supported. Voice has a dedicated stage,
restrained decorative waveform, optional captions and persistent **Silenciar /
Terminar voz / Continuar por texto** controls, including while viewing results.
The waveform illustrates state, not measured microphone amplitude. Returning to
text stops capture without clearing the draft, selected conversation or results.
History is a drawer, not competing transcript blocks. On ending a pending turn,
history must confirm its outcome before another text question can be sent.

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
turn admission and tool execution. Withdrawal immediately stops local work and
blocks new admitted work after commit; it does not retract provider disclosures or
guarantee cross-device termination of already-admitted audio.

Partials and playback captions stay in bounded memory. Completed readable exchanges
use existing chat retention/deletion. No audio, draft, SDP or transcript enters
browser storage, hydration or application logs. Provider retention is separate.
Deleting chat does not undo finance or delete independent receipts. Review provider
project data controls before enabling.

## Bounds, failure handling and release gates

Default disabled. API-only `ASSISTANT_VOICE_ENABLED`, dedicated key/model and a
configured non-demo text assistant are required. Initial deployment is **one API
replica**: process-local admission allows one session per owner, four globally,
three starts per owner/hour and five minutes per session, including mute. Both
client and server have 60-second idle bounds. Setup has a 15-second browser deadline;
sideband connection/configuration also has bounded deadlines. A native turn has a
65-second deadline, at most eight read/status calls and four proposals. Source
budgets match text: 24 KB each / 64 KB per turn. Queued events, speech items, output
length and observation-stream bytes are bounded. Excesses fail closed.

Default provider output is 1,024 tokens per response. This is not a security/currency
quota against modified browser commands. Use a dedicated project spend limit and
alerts. Distributed durable admission and hangup recovery are required before
multiple replicas.

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

Deterministic tests cover native-audio response triggering before transcription,
owned tool execution, late evidence, interruption/correction, caption completion,
duplicate calls, approval isolation, HTTP ownership and media cleanup. Mocked browser
checks do not capture a real microphone or invoke a live model. Current/previous
Chrome/Edge, Android Chrome and Safari iOS/macOS remain the target live matrix;
Firefox is best-effort pending device validation. Denied permissions, autoplay,
network/provider failure and timeouts retain text fallback.

Live provider/model/browser fidelity, latency, project usage/cost and actual remote
shutdown require **separate authorization**, synthetic owners and recorded evidence.
Implementation does not authorize real financial disclosures, microphone capture
or mutations and does not establish production readiness.
