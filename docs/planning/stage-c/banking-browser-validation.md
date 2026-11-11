# Banking browser validation — 2026-11-11

## Scope and isolation

This is browser evidence for the uncommitted LAZ-74 UI, not live-bank or
production-readiness evidence. The current UI was rebuilt with
`pnpm --filter ui build` before execution. The build passed, with warnings for
the initial bundle budget, assistant stylesheet budget and CommonJS contracts.

The smoke uses real headless Chromium through Playwright and axe. It serves
`apps/ui/dist/ui/browser` through a static SPA fallback on
`http://127.0.0.1:47974`. It mocks every RPC response and blocks other remote
requests. Mock session restoration supplies only a synthetic identity/token.
A synthetic `window.Fintoc` factory exercises success/cancellation callbacks;
it loads no provider SDK, opens no iframe and verifies no bank authorization.
No API service, database, real bank or provider is used.

## Reproduction and local artifacts

- Script: `/tmp/opencode/laz74-banking-browser.mjs`.
- Results and synthetic RPC call log:
  `/tmp/opencode/laz74-banking-browser-artifacts/results.json`.
- Screenshots and run instructions:
  `/tmp/opencode/laz74-banking-browser-artifacts/`.
- Existing tooling: `/tmp/opencode/laz71-browser/node_modules`.
- Chromium: `158.0.8127.18`.

```sh
pnpm --filter ui build
LD_LIBRARY_PATH=/tmp/opencode/laz71-browser/usr/lib \
  node /tmp/opencode/laz74-banking-browser.mjs
```

The local ALSA library is required by this environment's Chromium executable.
No repository dependency was added. The script closes its browser and its own
loopback listener in `finally`. The artifacts are local, ephemeral files, not
published attachments or committed browser fixtures.

## Observed results

The final run completed **27 named checks with zero failures**. It made 173
intercepted synthetic RPC calls, including 23 explicitly exercised mutations.
There were **zero unhandled browser errors and zero attempted external
requests**. After execution, `ss -ltn 'sport = :47974'` showed no listener.
The tested build included `main-COIVRFPW.js` and banking chunk
`chunk-C4Z9d2KJ.js`.

At **360, 390, 768 and 1280 pixels wide**, accounts, the alias drawer and the
discovered-account selection state passed horizontal-overflow checks. The
drawer retained keyboard focus through forward/reverse Tab navigation. Escape
closed it, restored focus to its opener and sent no alias mutation.

| Journey | Browser observation with synthetic responses |
| --- | --- |
| Retained accounts | Selected, paused and no-access labels remained distinct. Unknown balances displayed an em dash, not zero. Card debt displayed the debt label and absolute amount; an unknown card balance remained unknown |
| Alias update and clear | Whitespace was trimmed. Clear sent explicit `null`. The parent reloaded owned account facts after the confirmed command |
| Uncertain alias response | The synthetic handler saved before returning an error. The editor locked; its reconciliation action closed the drawer and caused one parent readonly reload, without repeating the mutation |
| Initial settings/status | Navigation and opening synchronization issued no mutations. Explicit discovery issued only discovery, not selection or financial import |
| Confirmed subset | Confirming one selected account and automatic opt-in sent one versioned set, rechecked current status and caused exactly one first import, with no refresh mutation |
| Guarded continuation | When the current status disallowed import after selection confirmation, the UI retained the saved selection but issued no financial import |
| Empty pause | Confirming no selected accounts retained the pause/history explanation and issued no import |
| Unavailable inventory | An unsupported unselected account was disabled. Removed and missing selected accounts could be unchecked, then could not be newly selected |
| Stored read backoff | The waiting-period explanation was visible and discovery was disabled |
| Automation disabled | Opt-in remained saved while the UI explicitly disclosed that this server had automatic updates disabled |
| Uncertain selection | A lost synthetic selection response blocked further writes. Fresh readonly selection reconciliation did not replay selection or initiate import |
| Import/source/access distinctions | A committed result with conflicts retained review warnings and stale bank-source time. A later failed import retained the previous success/source information. Revoked access separately disabled synchronization without erasing the retained success or source-age facts |
| Cancellation during import | Closing the panel stopped waiting, disclosed that work might continue, and reopening read status without repeating import |
| Optional onboarding | The guide linked to the shared `/conexiones-bancarias?from=onboarding` page. Cancellation, synthetic authorization success/failure and import success/failure retained the explicit return link to `/comenzar`. An arbitrary `returnURL` did not change that destination |
| Authorization boundary | Only an injected callback factory was used. Success/cancellation/failure exercised local continuation without loading Fintoc code, opening a provider iframe or implicitly importing on authorization |

## Accessibility and findings

- **21 axe scans** with `wcag2a`, `wcag2aa` and `wcag21aa` tags: **zero
  violations**. States included responsive account lists, alias drawers,
  discovered selections, uncertain alias/selection responses, first-import
  conflicts, empty pause, removed accounts, read backoff, import failure,
  revoked access and authorization error.
- **Six separate heading-order scans:** zero violations, including selection,
  first-import conflict and import-error states.
- No production browser defect was reproduced in the tested scenarios.
  Preliminary script failures were corrected harness selectors/waiting, not
  production changes. No runtime/source/test fix was made during this smoke.

## Limits

This validates the rendered Chromium UI and its request sequencing against
controlled responses. It does not validate API authentication, SQL/RLS,
provider mapping, background execution, commercial entitlement, real consent,
bank freshness, actual billing, network-level cancellation/rollback or live
Fintoc compatibility. The mocked success path is not authorization evidence.

Automated axe checks and keyboard smoke are not a full WCAG conformance audit.
Screen-reader review, other browsers, physical mobile devices, zoom/theme
matrices, representative load and maximum-size histories remain separate work.
No issue status, staging or commit was changed by this validation.
