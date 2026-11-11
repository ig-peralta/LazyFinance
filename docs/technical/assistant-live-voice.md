# Live voice contract (LAZ-95)

## Selected design and capability evidence

Use OpenAI Realtime's unified WebRTC interface: authenticated API exchanges an
SDP offer at `POST /v1/realtime/calls`; browser media tracks carry continuous
bidirectional audio and the data channel carries VAD/transcription/cancellation.
No API key or ephemeral provider credential reaches the browser. The API binds
the opaque local session to the verified owner and an allowlisted browser origin.
This is not recording upload, browser speech recognition or browser speech synthesis.

Capability evidence consulted 2026-11-10 (documentation, not a live test):

- [WebRTC unified interface](https://developers.openai.com/api/docs/guides/voice-webrtc?api=realtime): multipart SDP/session exchange, remote audio tracks and data channel.
- [Realtime conversations](https://developers.openai.com/api/docs/guides/realtime-conversations): server VAD with automatic responses disabled, input transcription, out-of-band audio responses, response cancellation and output-buffer clearing.
- [Call hangup](https://developers.openai.com/api/reference/resources/realtime/subresources/calls/methods/hangup): server-side termination.

Additional API-reference review on 2026-11-11 confirmed
[`RealtimeSessionCreateRequest`](https://developers.openai.com/api/reference/resources/realtime/subresources/client_secrets/methods/create)
supports the selected `gpt-4o-mini-transcribe` input transcription, Spanish language
hint, `marin` voice and numeric `max_output_tokens`. Both VAD automatic-response
and automatic-interruption flags are false: application cancellation handles
out-of-band replies. No ephemeral-secret endpoint is used by this implementation.

In the normal first-party UI, voice is an audio front end to the existing financial
assistant, not a second financial agent. Completed input transcripts enter the same
authenticated turn pipeline and saved history. That client requests speech only
for confirmed, complete grounded replies, using an out-of-band response with empty
conversation context and no tools.
The normal client sends no raw financial tool JSON to the audio renderer. Audio is model-generated
and may mispronounce or depart from the supplied text: the saved written answer,
references, uncertainty and exact approval cards remain authoritative. No voice
event or spoken agreement calls approval/execution. Do not release without checking
spoken/text fidelity on synthetic fixtures.

**Rendering is client policy, not a server-enforced grounding sandbox.** The browser
owns the provider data channel. A modified own client can send `response.create`
or change session instructions and request ungrounded audio independently of the
saved-turn pipeline. No provider setting used here prevents those client commands.
It can also override application-requested output settings. Neither the data
channel nor provider output has first-party financial tool credentials, ownership
authority or an approval endpoint: exact saved-action approval stays independently
authenticated and server-validated. Strong rendering enforcement would require a
different server-controlled media/event transport, not a prompt or an invented
provider permission. Interpolated read-aloud instructions do not guarantee fidelity;
the written answer and references remain authoritative.

## Controls, privacy and lifetime

Account-persisted processing consent precedes external text processing. A separate voice
start confirms that microphone audio and completed answer text go to OpenAI,
including during silence; paid processing may occur. No automatic microphone
request, reconnect, transcript replay or automatic retry. Start requests permission;
mute disables audio tracks and clears pending input; End stops tracks immediately,
closes transport and requests owner-bound server hangup. Minimize, navigation,
conversation replacement, hidden tab, device loss, logout, credential replacement
and component destruction end voice. Minimize retains only in-memory text state
and may retain text generation; Stop generation is a separate control.

First-time/refused consent shows a dedicated assistant entry screen. After current
acceptance is confirmed, **Conversar por voz** opens the voice disclosure without
another session checkbox. Only **Entiendo, iniciar micrófono** can begin startup,
guarded by owner, supported browser, valid selection, idle state, current saved
consent and enabled non-demo text/voice configurations. Opening the
disclosure never creates a conversation or requests capture. Failed/disabled
availability offers an explicit **Volver a comprobar voz** read; ordinary chat
refresh also reloads voice availability without replaying a start.

Startup has a cancellable generation before conversation creation: cancel, consent
withdrawal, navigation, minimize (even followed by reopen), hidden tabs, owner change
and teardown invalidate it before any microphone request. Every asynchronous startup
boundary checks that same generation, consent, visibility and accepted owner.
The server also checks current account consent before new voice admission/provider
requests. Withdrawal stops local capture/text immediately, including when its save
is uncertain; it blocks new admissions after commit, not already-admitted remote
audio on every device. See [account consent and reconciliation](financial-assistant.md#account-processing-consent).

Input partials and actual spoken-output transcripts are visible in memory. Completed
questions and authoritative replies use existing server chat retention/deletion;
audio is not recorded/stored by LazyFinance. No chat, draft, audio, SDP or voice
transcript enters browser storage, logs or hydration. Provider retention is separate:
operators must review their project terms/data controls before enabling. Chat deletion
does not promise deletion from provider systems/backups or delete financial receipts.

Up to 24 speech items are tracked by provider item ID. Asynchronous completions
are delivered to the ordinary question path in speech-start order, not completion
arrival order. Every completed transcript is also retained in a bounded in-memory
review list immediately; if an earlier item never completes or the conversation
is interrupted/busy, the user can explicitly prepare a draft after inspecting saved
history. These items are not automatically replayed. Mute invalidates pending
items; End invalidates delivery and late events. Owner/conversation changes and
Close clear retained transcripts.

## Bounds and targets

Default disabled. Enable only with explicit API-only voice flag, dedicated provider
key and model; text generation must also be configured (not offline demo).
Initial deployment supports **one API replica**: admission is process-local,
one session per owner, four globally, three starts per owner/hour, five minutes
per session including mute. Server hangup timer bounds a disconnected browser;
60-second idle client timeout and 15-second setup deadline. No seamless reconnect.
The normal client requests a default maximum of 1,024 audio output tokens/response;
this is not a hard security limit against modified browser commands. These bounds are not a currency quota;
set a dedicated project spend limit/alert before deployment. Restart loses local
leases; provider's own maximum session lifetime remains the ultimate failure bound.
Distributed durable admission/hangup recovery is a prerequisite for multiple replicas.

Graceful shutdown marks the service draining and refuses new starts, including
those still awaiting ownership reads. Initialization leases remain tracked until
the remote call ID arrives; draining/stop-requested late calls are terminated, never
returned as usable sessions. Shutdown waits at most 20 seconds and makes at most
three five-second hangup attempts per known session in that drain generation. Unconfirmed known remote IDs are
retained in memory for further recovery attempts, with an operator warning; cleanup
callbacks still run if a delayed response arrives while the process remains alive.
There is **no durable lease store**. Process kill/crash/restart, a lost initialization
response without a call ID, unresolved hangup or process exit after the drain deadline
can leave remote processing unconfirmed. The provider-documented maximum session
lifetime and project spend controls remain the fallback, not an application hard
budget or guaranteed five-minute termination. SDP and hangup requests reject HTTP
redirects; SDP is decoded with a 64,000-byte stream limit and cancelled on excess.

Targets (not measured SLAs): local track stop/output mute within 100 ms of End or
barge-in dispatch; provider output clear/cancel under 500 ms; speech-end to completed
transcript under 2 s; confirmed written reply to first audio under 2 s. Financial
generation/read latency is measured separately (existing 65-second turn bound).
Barge-in immediately silences obsolete audio, cancels pending text generation,
and never silently resends a question whose save status is uncertain. The next
transcript is retained for explicit text reconciliation if the old turn is busy.

## Browser/device release matrix and validation

Targets: current and previous desktop Chrome/Edge on Windows/macOS/Linux, Chrome
Android and Safari iOS/macOS with HTTPS/localhost, getUserMedia, WebRTC and data
channels. Firefox is best-effort pending device/audio validation. Unsupported,
denied permission, device loss, autoplay rejection, network/provider failure and
timeouts retain text fallback. No browser is claimed live-verified by unit tests.

Controlled tests must cover duplex tracks/events, permission races, cleanup,
late callbacks, mute, barge-in, session/owner replacement, errors and exact approval
isolation. Live matrix, audio/text fidelity, latency, project usage/cost and remote
hangup checks require **separate authorization**, synthetic owners and a recorded
provider/model/browser/date. No live request or real financial disclosure is
authorized by implementing this adapter. Until that evidence exists the adapter
stays disabled by default; implementation is not a production readiness claim.
