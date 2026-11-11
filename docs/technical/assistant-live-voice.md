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

Voice is an audio front end to the existing financial assistant, not a second
financial agent. Completed input transcripts enter the same authenticated turn
pipeline and saved history. Only confirmed, complete grounded replies are read
aloud using an out-of-band response with empty conversation context and no tools.
No raw financial tool result is sent to the audio renderer. Audio is model-generated
and may mispronounce or depart from the supplied text: the saved written answer,
references, uncertainty and exact approval cards remain authoritative. No voice
event or spoken agreement calls approval/execution. Do not release without checking
spoken/text fidelity on synthetic fixtures.

## Controls, privacy and lifetime

Separate disclosure precedes external text processing. A second explicit voice
start confirms that microphone audio and completed answer text go to OpenAI,
including during silence; paid processing may occur. No automatic microphone
request, reconnect, transcript replay or automatic retry. Start requests permission;
mute disables audio tracks and clears pending input; End stops tracks immediately,
closes transport and requests owner-bound server hangup. Minimize, navigation,
conversation replacement, hidden tab, device loss, logout, credential replacement
and component destruction end voice. Minimize retains only in-memory text state
and may retain text generation; Stop generation is a separate control.

Input partials and actual spoken-output transcripts are visible in memory. Completed
questions and authoritative replies use existing server chat retention/deletion;
audio is not recorded/stored by LazyFinance. No chat, draft, audio, SDP or voice
transcript enters browser storage, logs or hydration. Provider retention is separate:
operators must review their project terms/data controls before enabling. Chat deletion
does not promise deletion from provider systems/backups or delete financial receipts.

## Bounds and targets

Default disabled. Enable only with explicit API-only voice flag, dedicated provider
key and model; text generation must also be configured (not offline demo).
Initial deployment supports **one API replica**: admission is process-local,
one session per owner, four globally, three starts per owner/hour, five minutes
per session including mute. Server hangup timer bounds a disconnected browser;
60-second idle client timeout and 15-second setup deadline. No seamless reconnect.
Maximum 1,024 audio output tokens/response. These bounds are not a currency quota;
set a dedicated project spend limit/alert before deployment. Restart loses local
leases; provider's own maximum session lifetime remains the ultimate failure bound.
Distributed durable admission/hangup recovery is a prerequisite for multiple replicas.

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
