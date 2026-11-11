# Clear, customizable workspace — LAZ-75

Implementation record, 11 November 2026. This is not a rewrite of Stage B evidence.

## Delivered behavior

| Issue | Change |
| --- | --- |
| LAZ-78 | Short Spanish dashboard/history headings, explicit edit entry, native secondary disclosures and retained primary financial warnings/facts |
| LAZ-81 | Visible archive action, name validation, native color preview, catalog-versus-assignment explanation, draft-preserving rejection and explicit uncertain-outcome catalog read |
| LAZ-77 | Separate tag/no-tag/unreviewed labels and internal-status correction; unavailable references cannot be assigned; obsolete movement results suppressed; explicit uncertain-outcome reads without write replay |
| LAZ-82 | System/light/dark semantic tokens, three text sizes, visible focus, reduced-motion baseline, allowlisted presentation-only device persistence and blocked-storage feedback |
| LAZ-84 | Explicit persisted compact desktop sidebar, named destinations and focus/hover labels; mobile modal and skip link retained |
| LAZ-79 | Tested reusable `?` binding with explicit open callback; **host integration below is required** |

Financial amounts, booked dates, reported balances, review status and domain
calculations are unchanged. Tag catalog edits do not reclassify movements.
History links retain URL filters; saving within detail keeps its reading/filter
context. Returning to the history route still uses the existing fresh first page;
this change does not persist private cursor trails or financial snapshots.

## Before/after examples

- Dashboard: “Una mirada más clara a tu dinero” → “Resumen del mes”. Selected
  period, exact amounts, estimated/unknown income and “no es dinero disponible” stay.
- Catalog: close icon → **Archivar**. The confirmation still explains retained
  references and reserved names. Edit effects move from a permanent notice to
  **Qué cambia al editar**.
- History: generic exploration copy → “Abre un movimiento para revisar sus hechos,
  etiqueta o clasificación”. Manual, rule and unreviewed origins appear in rows.
- Detail: “Corregir clasificación” → **Editar etiqueta o clasificación**. The
  secondary financial explanation is a native disclosure; pending/removed facts,
  receipts and recovery warnings remain outside it.

## LAZ-72 integration contract

The integrated `AppShell` now binds this callback once per accepted credential
scope and removes it on scope change/destruction. Both deferred and minimized
launchers expose **Abrir asistente · ?** with `aria-keyshortcuts="?"`. The same
shell-owned assistant inherits appearance tokens; no second host is mounted.
Hidden persistent/non-modal assistant dialogs do not disable the restore shortcut;
real modal editors, appearance controls and editable fields retain their keys.
Shell/shortcut regression tests cover binding, restoration, navigation and cleanup.

The original branch-level integration recipe is retained below for context:

No fake `AssistantWorkspace` implementation or second host was added. After
merging LAZ-72, wire its authenticated persistent host (or `AppShell`) as follows:

```ts
import { DOCUMENT } from '@angular/common';
import { DestroyRef, inject } from '@angular/core';
import { AssistantWorkspace } from '../../features/assistant/assistant-workspace';
import { bindAssistantShortcut } from './assistant-shortcut';

// Inside that authenticated owner's constructor/injection context:
const workspace = inject(AssistantWorkspace);
const unbind = bindAssistantShortcut(inject(DOCUMENT), () => workspace.open());
inject(DestroyRef).onDestroy(unbind);
```

Adapt relative import paths to the owner. Bind once, only for verified workspace
access, and do not install it on public/guest routes or retain it after logout.
Expose **Abrir asistente · ?** and `aria-keyshortcuts="?"` on the actual host's
open/restore control, with a short help label “Fuera de campos de texto”. The
shortcut is intentionally not advertised as active in this unintegrated branch.
`open()` must focus the existing assistant composer/heading, capture the invoker,
and minimize/close must restore focus to a still-connected invoker or a stable
workspace fallback. The binding deliberately leaves focus to that existing host.

The binding ignores consumed events, Ctrl/Meta/Alt chords, repeats, IME,
inputs/textareas/selects/contenteditable/textboxes, native modal dialogs, visible
modal/custom dialog roles and the open appearance popover. The integrated binding
explicitly permits hidden persistent dialogs and the visible non-modal assistant,
so restoring/focusing the existing host remains possible. `?` may require Shift on
the user's layout; Shift alone is not rejected. No browser/OS Ctrl/Meta chord is
overridden.

Mount the host **inside `.workspace`** so it inherits `--ink`, `--muted`, `--paper`,
`--raised`, `--canvas`, `--line`, `--accent`, `--accent-soft`, `--danger`,
`--warning`, `--accent-contrast` and `--workspace-text-scale`. New assistant pixel
font sizes should multiply by `var(--workspace-text-scale)` or use rem units.
App-shell changes here are localized to preference injection/imports, workspace
attributes, navigation label spans/names and topbar appearance controls. LAZ-72's
host mount may conflict in `app-shell.ts`/`app-shell.html`; preserve both additions.

## Verification and remaining release checks

| Check on this branch | Result |
| --- | --- |
| Locked install / UI dependency builds | Passed |
| `pnpm --filter ui exec ng test --watch=false` | 446 tests passed across 58 files |
| `pnpm --filter ui build` | Passed; public landing only prerendered |
| `pnpm format:check` / `pnpm lint` | Passed; existing 27 warnings and 10 informational diagnostics |
| `pnpm check:architecture` | Passed |

Build warnings: initial bundle 587.89 kB against a 500 kB warning budget,
existing assistant styles 6.63 kB against 4 kB and contracts CommonJS optimization
warning. No thresholds were relaxed. Backend/database/live-provider suites were
not run: this branch changes UI and guides only, not APIs, schemas or migrations.

Serverless UI tests exercise preference defaults/invalid/blocked storage, reload
values, all three size attributes, compact/sidebar names, mobile modal dismissal,
skip focus, shortcut conflict/teardown, tag catalog edits, no-tag/reset, ownership,
duplicate commands, stale reads and uncertain-outcome recovery.

These jsdom tests do **not** prove viewport layout, contrast, native browser focus
containment or screen-reader behavior. The initial implementation session did not
discover browser tooling; the browser follow-up below supersedes that gap for its
explicitly tested states. Before release/integrated acceptance, verify widths
320/390/768/1440, short height, 200% zoom and largest text in both themes; check
long labels, amounts, editor/assistant controls, no document overflow, mobile
Escape/focus return, compact-label keyboard tooltips and screen-reader names.
Also test integrated shortcut focus/minimize/restore, authenticated navigation,
logout, guest behavior and overlays with LAZ-72. No live bank/model, API listener,
database, credentials or environment change is part of this work.

### Chromium follow-up — 11 November 2026

Used production static output from this worktree, Playwright 1.65 and Chromium
158.0.8127.18 with mocked RPC only. An ephemeral HTTP listener bound to
`127.0.0.1`; the script closed its browser and listener in `finally`. All other
network destinations were intercepted and either mocked or blocked. No live API,
provider, database, production identity, environment file or repository dependency
was used or changed. Existing external tooling under `/tmp/opencode/laz71-browser`
was reused read-only, not another feature worktree.

**Bug found and fixed:** the original shared primary-button contrast selector had
the same specificity as the later legacy workspace rule. In light mode the later
rule won, producing dark `#052e22` text on `#086b4a` green (axe measured 2.26:1).
The theme-aware selector now wins the cascade for primary actions, brand marks
and skip links. A dedicated real-browser regression checks computed primary text
and background contrast >= 4.5:1 in light/dark at all four widths. No budget or
accessibility thresholds were relaxed.

| Actual browser check | Result |
| --- | --- |
| Catalog/editor matrix: 360/390/768/1280 px, light/dark, every actual text choice | Passed, including long tag names and reachable editor actions |
| Text controls | **Normal 100%, Grande 115%, Muy grande 130%**; no small or 125% control exists on this branch |
| Appearance popover at viewport edges, keyboard Enter/Tab focus into options | Passed |
| Full and compact desktop navigation, all text choices/both themes | Passed; accessible destination names and keyboard-visible tooltip labels |
| Preference reload | Theme, largest text and compact choice retained |
| 360 px native mobile menu, 10 Tab steps, Escape and opener return | Passed; no background control received focus; Chromium's native tab cycle can briefly focus the document body |
| Skip link Enter | Focus moved to main without navigating |
| Name validation, duplicate-name draft preservation and explicit creation | Passed |
| Archive confirmation/cancel then confirmation | Passed; cancel made no write, confirmed archive retained its explanatory warning |
| Lost create response after simulated commit | Catalog read recovered without another create, preserving the draft |
| Filtered history → detail → history | Merchant/internal filters retained |
| History toolbar Tab order and advanced-filter Escape | Search controls reachable; Escape returned focus to the filter toggle without changing the URL |
| History at all four widths, largest text, both themes | No document overflow or essential horizontal viewport-edge clipping |
| Detail at all four widths, largest text, both themes | No horizontal document overflow or essential horizontal viewport-edge clipping |
| Selected tag → deliberate no-tag → reset → internal classification | Distinct commands/states; original amount/date and unrelated tag/internal decisions retained |
| Lost decision response after simulated commit | Further writes disabled; close/read reconciliation made no duplicate mutation |
| Failed reconciliation read followed by successful retry | Error stayed explicit; editor unavailable until successful detail read |
| axe WCAG2 A/AA and WCAG2.1 AA | **99 scans, zero violations** in catalog, appearance, tag editor, compact navigation, mobile menu, archive confirmation, history and movement/detail/classification states |
| Script assertions / browser errors / unexpected external requests | **199 passed / zero / zero** |

The first harness draft incorrectly counted content inside closed native
disclosures as clipped and tried to assert `:focus-visible` immediately after
mouse/programmatic focus. The final checks use Chromium visibility checks and
actual Tab/Shift+Tab keyboard modality, excluding those false positives. The
contrast failure above was a real product failure, not a harness false positive.

Revalidation after the fix: production UI build, all **446 UI tests across 58
files**, formatting and architecture checks passed. The existing initial-bundle,
assistant-style and CommonJS build warnings remain.

#### Reusable scripts and artifacts

The committed focused regression uses external tooling without adding packages:

```sh
pnpm --filter ui build
BROWSER_TOOLING_ROOT=/tmp/opencode/laz71-browser \
LD_LIBRARY_PATH=/tmp/opencode/laz71-browser/usr/lib \
node apps/ui/tests/browser/workspace-contrast.mjs
```

Full mocked-RPC matrix and fault-injection script:
`/tmp/opencode/laz75-browser.mjs`. It accepts `UI_DIST` to point at another built
UI for coordinator integration reuse. Run with the same `LD_LIBRARY_PATH` above.
It creates/stops its own ephemeral loopback server and writes
`/tmp/opencode/laz75-browser-artifacts/results.json`, `run.log`, responsive editor
screenshots and `compact.png`. `results.json` retains per-state axe results,
assertion names, synthetic RPC calls and browser version. Build and UI suite logs
are `build.log` and `ui-tests.log` in that directory. These are local artifacts,
not a repository dependency or production fixture.

**Limits:** this is Chromium automation and automated axe screening, not a
screen-reader or complete WCAG audit, cross-browser certification, OS/browser
200% zoom test or live-backend persistence proof. Native input scrolling for long
draft names is expected; no essential control was hidden at the tested viewport
edges. Dashboard-specific live data, live source freshness and account/banking
pages were not part of this follow-up. LAZ-72 shortcut host wiring/focus behavior
remains intentionally unmodified and requires integrated validation. The earlier
history cursor-trail limitation is unchanged.
