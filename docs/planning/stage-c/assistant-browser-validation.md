# Integrated assistant browser validation

11 November 2026, final post-fix rerun. **All 103 checks passed; zero failures;
43 axe scans with zero violations.** The previously discovered deferred-launcher
focus defect is verified fixed. This is a pass for the mocked Chromium matrix
below, not an unrestricted accessibility/provider certification.

## Baseline and isolation

Tested the integrated LAZ-72 worktree containing the merged workspace, banking
and MCP work, rebuilt after coordinator fix **`6c608cca`**. The authorized final
production UI build completed at **04:01:48 UTC** with HEAD
**`6c608cca383ec05efbc58ad1d7f258627b8ae773`**. Its browser assets are identified
below; these hashes refer to the exact output used in the final rerun.

| Asset | SHA-256 |
| --- | --- |
| `main-DTFT2I2I.js` | `876c03cf70e96279f5a1de048649c61aabef51773a45ced8bae92083f9fb1616` |
| `styles-FTXAQQTC.css` | `c2a443b8e5aef7bf0a32f415cdb65289e0173c62adc3366d48fad4afabea6ce5` |
| `chunk-D2uRmCDn.js` (assistant) | `710af594f92f59c069eaf06f59028c2c78bc62cfaeb2e84cc592011f1477193f` |

Playwright used headless Chromium **158.0.8127.18**, reduced motion and an
ephemeral **127.0.0.1** static-file listener. The final run used port **36247**;
every run closed its own browser and listener in `finally`. All application
requests were mocked or blocked. There were **zero unexpected external requests
and zero browser page errors**.

The browser's microphone acquisition, tracks, peer connection, data channel and
audio objects were replaced before application startup. No real microphone,
human permission prompt, provider endpoint, API server, database or production
credential was used. Synthetic mock sign-in inputs/tokens were the only identity
material. No dependencies were added to the repository. The QA agent changed no
source, test, environment, staging or commit state; this document is its only
worktree addition. The coordinator owns any fixes and commits.

The final production build passed with existing warnings: initial bundle
**593.37 kB** against the 500 kB warning budget (**93.37 kB over**), assistant
styles **4.89 kB** against 4 kB (**887 bytes over**) and the contracts CommonJS
optimization warning (reported from `pages/income/income.page.ts`). No thresholds
were relaxed. Angular
tests were not rerun by this browser QA task, avoiding the shared-cache work the
coordinator had already completed.

## Actual browser results

| Area | Observed result |
| --- | --- |
| Assistant responsive matrix | All 24 combinations of 360/390/768/1280 px, light/dark and actual Normal/Grande/Muy grande controls passed horizontal document/essential-control edge checks and axe |
| Actual text sizes | 100%, 115%, 130%; no 125% or small-text choice was invented for this test |
| Largest-text mobile references | Expanded references and the saved proposal also passed layout/axe at 360/390 px in both themes |
| Deferred host / shortcut | First `?` from a connected non-editable control mounted one host. Subsequent minimize/reopen reused the same DOM instance, draft, history and references without another conversation or turn |
| First deferred launcher focus | After first placeholder activation and minimize, focus returned to the visible persistent **Abrir asistente · ?** button; the original failing assertion now passed unchanged |
| Visible desktop assistant | `?` from a background navigation link focused the existing composer without toggling, resending or creating another host |
| Shortcut conflicts | Typing `?` in the composer did not toggle the panel. The tag editor/native modal, mobile menu and open appearance disclosure blocked the global shortcut |
| Navigation | Actual background navigation with the desktop nonmodal assistant kept the same host and draft. No navigation-triggered text replay occurred |
| Mobile modality | At 390 px the background workspace was inert, all 24 sampled Tab steps remained inside the assistant, and Escape restored the connected persistent launcher |
| Menu/assistant coordination | Opening the assistant through the mobile menu closed the native menu; `?` did not open a second surface over that real modal |
| Processing disclosure | External text/model disclosure and explicit session acknowledgment preceded any turn. Text/voice controls were disabled without acknowledgment |
| Separate voice disclosure | The first voice button exposed its own audio/provider/cost/retention warning without acquiring a microphone. Only its explicit acknowledgment started the synthetic microphone |
| Provider presentation | Provider/model names were available in the pre-processing disclosure, not reply headings/chat badges. Injected vendor/private-trace error text was not rendered |
| Stream anchoring | Instrumented `scrollIntoView` recorded exactly one `block: start` anchor per generated turn, not per delta/source/action update |
| Manual scroll / jump | A manually positioned message scroll stayed unchanged through later text, references, proposal and completion. Explicit jump made the bottom marker visible; trailing container padding was not mistaken for a failure to jump |
| References | Default collapsed, explicitly expandable, retained across minimize/reopen, separately rendered from prose and axe-checked expanded |
| Saved actions | Speaking synthetic `sí` created an ordinary grounded text turn but made zero approvals. Only the proposal's **Guardar etiqueta** button submitted the exact saved `{ id, version }`; one approval was observed |
| Voice controls | Start, mute, unmute and explicit end updated the actual UI and synthetic track state |
| Voice transcript | A synthetic completed speech transcription traversed the existing grounded text-turn path, producing saved text/references instead of an independent audio-only financial answer |
| Barge-in | Synthetic speech-start muted obsolete output, sent response cancellation/clear events and prevented stale output-transcript deltas from appearing |
| Voice lifecycle cancellation | Minimize, route navigation, document-hidden, consent withdrawal and logout stopped synthetic tracks. Minimize retained the text draft and did not reacquire a microphone on reopening |
| Deferred conversation creation | Requests actually reached the held create barrier. Canceling voice before releasing it caused no microphone acquisition afterward |
| Deferred text consent withdrawal | Withdrawing acknowledgment while create was held prevented the continuation from making a text-turn request when that response was released |
| Pending microphone acquisition | Canceling while the synthetic microphone promise was held stopped the subsequently returned track and made no voice-session request |
| Logout / new owner | Logout destroyed the host and stopped capture; guest `?` opened no host. A different synthetic principal started with no old draft, references, acknowledgment or assistant instance |
| Browser storage | Only the allowlisted presentation preference key was in localStorage and the synthetic mock-auth token in sessionStorage; document cookies were empty. No chat, draft, reference, voice token or financial response was found there |
| Long stored account labels | Largest-text light/dark checks passed at all four widths, with a long account alias and a large exact CLP amount |
| Long banking selection labels/IDs | A contract-shaped 94-character account name and a retained 508-character missing-account reference wrapped without horizontal document overflow at all four widths; the actual selection panel was open, not merely a loading frame |
| Automated accessibility | **43 axe scans, zero WCAG2 A/AA or WCAG2.1 AA violations** in the tested workspace, assistant, disclosure, reference, action, account and bank-selection states |

The final synthetic run recorded two text turns, four explicit conversation-create
requests (including the held/canceled scenarios) and one exact proposal approval.
Reopening/navigation checks asserted that their own create/turn counts did not
increase. Nine synthetic microphone acquisitions had nine corresponding track
stops by completion. The fake data channel recorded the expected output-create,
cancel and buffer-clear events. These counts are orchestration evidence, not real
provider usage or successful real financial persistence.

## Dated discovery and verified fix

### Initial discovery — 11 November 2026, before `6c608cca`

The original run had **102 checks passed and one failed**, with 43 clean axe
scans. It tested the 03:37:21 UTC build (`main-ICNV65DL.js`,
`styles-FTXAQQTC.css`, `chunk-ApqAXxH4.js`), with HEAD observed as
`a9e5ddd7fc52ee16ccd5bf7ef30d52b78fbf06b1`. Its initial bundle warning was
593.20 kB against 500 kB. The failure was **first deferred launcher loses focus
on minimize**:

1. Enter a fresh authenticated workspace before `assistant-page` has mounted.
2. Click the placeholder button **Abrir asistente · ?**.
3. Click **Minimizar** after the deferred host mounts.
4. In that original build, after hidden-state rendering settled,
   `document.activeElement` was `BODY`,
   not the now-visible launcher or a stable workspace fallback.

The original harness repeated this on fresh entry after the second synthetic owner
signed in. It separately verified connected-opener restoration, distinguishing
the defect from ordinary rendering timing or mobile focus trapping.

Source locations and behavior at discovery:

- `apps/ui/src/app/layout/app-shell/app-shell.html`: the `@placeholder` launcher
  is destroyed when `assistant-page` is mounted.
- `apps/ui/src/app/features/assistant/assistant-workspace.ts`:
  `restoreFocus()` only focused `opener` when it remained connected, with no
  fallback for this deferred-placeholder case.
- `apps/ui/src/app/pages/assistant/assistant.page.ts`: after-render hidden-state
  handling invokes that restoration method.

The original recommendation was to retain connected-opener behavior, but
when it is disconnected, focus the visible persistent assistant launcher (or a
stable `main` fallback) after rendering. Do not focus a hidden opener. Add a
regression for first placeholder activation → minimize, distinct from ordinary
reopen and Escape tests. **The QA agent did not apply a source fix.**

The retained `failure-1.png` is a **historical pre-fix screenshot**, not a failure
from the final run. Axe did not detect this interaction defect; it was found by
the keyboard/focus assertion.

### Final verification — 11 November 2026, `6c608cca`

The coordinator changed the host to pass its persistent launcher `ElementRef`
into `workspace.restoreFocus()` after hidden-state rendering. Connected valid
invokers retain focus; removed, body, hidden, inert, closed-dialog or ineffective
invokers can fall back to the host-owned launcher, and restoration is not attempted
without accepted credentials. Source/test ownership remained with the coordinator.

After rebuilding, the QA agent reran the **entire existing harness unchanged**,
not only a focused probe: **103 checks passed, zero failed; 43 axe scans, zero
violations; zero page errors; zero unexpected external requests**. The process
exited successfully. The formerly failing `first-deferred-launcher-focus-fallback`
assertion passed. Its final `firstLauncherRestore` trace is:

```json
{ "tag": "BUTTON", "text": "Abrir asistente · ?", "insideHidden": false }
```

The full connected-invoker, modal Escape, owner-change, voice cancellation,
privacy, reference/action and responsive checks also passed again. No new
reproducible product defect was found in this final matrix. The coordinator's
additional unit regressions were not independently rerun by this browser task.

## Scripts, artifacts and reuse

- Full browser harness: `/tmp/opencode/laz72-integrated-browser.mjs`.
- Artifacts: `/tmp/opencode/laz72-integrated-browser-artifacts/`.
- Final assertions, per-state axe results, synthetic RPC calls, focus trace,
  scroll anchors and voice/storage instrumentation: `results.json`.
- Run summary: `run.log` — **103 passed, zero failed, 43 axe scans**.
- Largest-text panel screenshots: `assistant-<width>-<theme>-largest.png`.
- Expanded mobile references: `reference-<width>-<theme>.png`.
- Open bank-selection panel screenshots: `banking-<width>.png`.
- Final production rebuild log: `/tmp/opencode/laz72-integrated-build.log`.
- Unchanged full harness SHA-256:
  `a2f69913dbc695a502bd92801f6b066f42a153d17c1a5d6a817cfe5071e66c73`.

```sh
LD_LIBRARY_PATH=/tmp/opencode/laz71-browser/usr/lib \
node /tmp/opencode/laz72-integrated-browser.mjs
```

`UI_DIST` may point the harness at another production browser directory for the
coordinator's integrated rerun. The script starts/stops its own non-default
loopback listener; no separately running application/API server is needed.

Earlier harness iterations were corrected to await after-render focus and
matchMedia updates, use genuinely focusable background controls, accommodate
the legitimate mock-login return destination and assert visibility of the jump
target rather than its trailing padding. Their transient assertions are not
reported as product defects. The disconnected-placeholder failure remained after
those corrections in the original build, and passed after the coordinator fix
without changing or weakening its assertion.

## Limits

This is real Chromium rendering, keyboard and axe automation with synthetic
transport/audio boundaries, not a human screen-reader audit, exhaustive WCAG
certification, cross-browser check, browser/OS 200% zoom test, real microphone or
audio playback check, SDP/WebRTC/provider interoperability proof, model-quality
evaluation, live Firebase verification or backend ownership/persistence test.
No automatic bank-selection discovery/import/write or provider authorization was
performed. Long names/IDs were tested for layout, not server persistence. Voice
race checks exercise the listed UI continuations; they do not replace the
independent backend voice review or prove every possible event ordering.

Any source change after the exact final build identified above requires a new
build and applicable rerun before extending these results to that later baseline.
