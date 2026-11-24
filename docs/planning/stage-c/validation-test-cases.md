# Stage C — validation test cases (LAZ-98)

**Status:** planned cases, **not execution evidence**. Every result cell is empty
until someone runs the case on a recorded build. This file refines the V01-V12
scenarios in the [validation plan](validation-plan.md); it does not replace them,
and it does not close LAZ-98 or LAZ-99.

## Basis and traceability

- Journeys and acceptance come from Linear LAZ-98 and the validation plan.
- Routes come from `apps/ui/src/app/app.routes.ts` (Spanish paths such as
  `/cuentas`, `/movimientos`, `/etiquetas`, `/conexiones-bancarias`,
  `/aplicaciones-conectadas`, `/comenzar`, `/asistente`).
- The assistant shortcut is `?`, per [experience-delivery](experience-delivery.md).
- The mock banking provider (LAZ-107) was delivered in
  [PR #50](https://github.com/ig-peralta/LazyFinance/pull/50) after this plan was
  written. The cases below still name their fixture (disposable fixtures, the mock
  bank or a separately authorized sandbox) and record which one was used.
- Executed evidence lives elsewhere and is **not** copied into this table:
  the [2026-11-22 real-stack run](validation-run-2026-11-22.md) (before the gate,
  mock sign-in, a single user) and the
  [2026-11-24 LAZ-100 record](laz100-validation-record-2026-11-24.md) (scripted suites in
  [`tests/validation`](../../../tests/validation/README.md)). Result cells here stay
  empty until a tester fills them for TC-01 to TC-16.

## Existing automated coverage (verified by file, not by execution)

| Journey | Existing test | Gap |
| --- | --- | --- |
| Onboarding skip/resume, two owners | `apps/api/tests/integration/onboarding/onboarding.integration.spec.ts`, `apps/ui/src/app/pages/onboarding/onboarding.page.spec.ts` | Browser journey not recorded |
| Fintoc import | `apps/api/tests/integration/banking/fintoc-import.integration.spec.ts` | Live/sandbox flow is LAZ-100 |
| Refresh and recovery | `apps/api/tests/integration/banking/fintoc-refresh.integration.spec.ts` | Background trigger with browser closed |
| Alias | `apps/api/src/accounts/account-alias.spec.ts` | No UI-level reload check recorded |
| Tags | `apps/api/tests/integration/transactions/tag-management.integration.spec.ts` | Movement correction from the UI |
| Connected apps | `apps/ui/src/app/pages/mcp-authorization/mcp-grants.page.spec.ts` | Named external client |
| Assistant streaming | `apps/ui/src/app/features/assistant/assistant-stream.client.spec.ts` | Browser scroll/focus behavior |
| Theme and text size | `apps/ui/src/app/layout/app-shell/workspace-appearance.spec.ts` | **No spec for reduced motion**; `prefers-reduced-motion` appears only in CSS (`apps/ui/src/styles.css`) |
| Contrast | `apps/ui/tests/browser/workspace-contrast.mjs` | Not a full accessibility audit |

## Run record (fill per execution)

Date/time and timezone, tester, Git commit and build, browser/version, viewport,
data class (synthetic, sandbox, live), and evidence location. No tokens, keys,
personal financial records or raw audio.

## Test cases

Result values: `passed`, `failed`, `skipped`, `blocked`.

| ID | Scenario | Precondition | Steps | Expected result | Level | Result |
| --- | --- | --- | --- | --- | --- | --- |
| TC-01 | V02 skip onboarding | New synthetic user | Open `/comenzar`; skip bank step; finish; reload; return to `/comenzar` | Skip is remembered, flow can resume, no bank link or import is created | Browser + RPC | |
| TC-02 | V02 cancel authorization | New user on bank setup | Start authorization; cancel the provider widget | Returns safely, no duplicate link, no import | Browser, synthetic widget | |
| TC-03 | V02 account selection | Sandbox or fixture with 3 accounts | Authorize; select 2; confirm | Only the 2 are tracked; one first import; no duplicates on repeat | Real RPC, `_test` DB | |
| TC-04 | V04 truthful recovery | Account with a stale or failed sync | Open `/conexiones-bancarias` | Last good data retained; freshness and failure are visible; opening the page triggers no provider work | Browser + fault injection | |
| TC-05 | V05 alias | Owned account | Set alias, change it, clear it, reload | Alias persists across reload; balance and source ID unchanged; clear stores null | Browser + RPC | |
| TC-06 | V05 foreign alias write | Two owners A and B | A tries to write B's account alias | Rejected; B's data unchanged | Real RPC | |
| TC-07 | V06 tag correction | Tagged movement counted in a budget | `/movimientos/:id`: change tag; reload; open `/presupuestos-y-metas` and `/dashboard` | New tag persists; budget and totals reconcile; date and amount unchanged | Browser + RPC | |
| TC-08 | V06 internal movement | Movement flagged internal | Mark external, then reset | Internal/external/unknown stays distinct from tag state; spending totals follow | Browser + RPC | |
| TC-09 | V07 persistent chat | Assistant enabled, synthetic data | Ask a question; minimize; navigate to `/cuentas`; restore | Same conversation, text kept; minimize does not delete | Browser | |
| TC-10 | V07 streamed reply | Long synthetic answer | Stream; scroll manually; expand references | Start of reply stays readable; manual scroll respected; position kept after expanding | Browser | |
| TC-11 | V09 preferences | Signed in | Set largest text size and dark/light; compact sidebar; reload | Preferences persist; focus restored; no financial data in local storage | Browser + storage inspection | |
| TC-12 | V09 shortcut and keyboard | Desktop and 360 px | Press `?`; tab through sidebar and mobile menu | Assistant opens and focuses; full keyboard path; visible focus | Browser | |
| TC-13 | V09 reduced motion | OS or browser reduced-motion on | Open workspace and assistant | Non-essential motion is off. **Currently no automated test.** | Manual / new spec | |
| TC-14 | V10 connected apps | Active grant | Open `/aplicaciones-conectadas`; revoke; call MCP with the revoked grant | Client, capabilities, expiry legible; access fails after revoke | RPC + named client | |
| TC-15 | V12 exact approval | Proposed financial action | Agree in text or voice without approving; then approve exact version; retry stale | Agreement alone changes nothing; only exact approval does; stale rejected | Real RPC | |
| TC-16 | Responsive | Build on 360 and 1280 px | Visit each workspace route | No horizontal overflow; headings and primary action visible | Browser | |

## Cannot be verified from code alone

Microphone/voice behavior (V11, LAZ-100) and a named external MCP client need a
human session: see [laz100-manual-sessions.md](laz100-manual-sessions.md), whose result
cells are empty. Live Fintoc authorization, background sync with the browser closed,
live Spanish model quality and two-user Firebase boundaries were executed by the
[LAZ-100 scripted suites](laz100-validation-record-2026-11-24.md) on the local stack
only. Deployed-environment checks (LAZ-106) and measured performance (LAZ-108) are
recorded in [closure.md](closure.md) and [performance-testing.md](performance-testing.md),
not here. None of this may be reported as passed beyond the scope those records state.
