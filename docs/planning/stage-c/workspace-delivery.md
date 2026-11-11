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
inputs/textareas/selects/contenteditable/textboxes, native modal dialogs, custom
dialog roles and the open appearance popover. The host must not leave a hidden
`role="dialog"` node mounted when minimized, or it would intentionally block
global shortcuts. `?` may require Shift on the user's layout; Shift alone is not
rejected. No browser/OS Ctrl/Meta chord is overridden.

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
containment or screen-reader behavior. No browser executable/tool was available
in this worktree session. Before release/integrated acceptance, verify widths
320/390/768/1440, short height, 200% zoom and largest text in both themes; check
long labels, amounts, editor/assistant controls, no document overflow, mobile
Escape/focus return, compact-label keyboard tooltips and screen-reader names.
Also test integrated shortcut focus/minimize/restore, authenticated navigation,
logout, guest behavior and overlays with LAZ-72. No live bank/model, API listener,
database, credentials or environment change is part of this work.
