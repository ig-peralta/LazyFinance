# Stage C — real-stack validation run, 2026-11-22

**Status:** executed evidence for part of LAZ-98 and LAZ-100. It is **not** a stage
gate decision (LAZ-99) and not production-readiness evidence. Scenario IDs refer to
the [validation plan](validation-plan.md) and [journeys](../../product/user-journeys.md).

> **Dated evidence.** This run is **before** the 2026-11-24 gate: it ran on `5950e016`,
> which predates the assistant overlay (PR #46), the mock bank (PR #50) and the security
> and performance work, with mock sign-in and one user. Its scripts live outside the
> repository. The reproducible suites and the Firebase/Fintoc/model/MCP evidence for
> LAZ-100 are in the [2026-11-24 record](laz100-validation-record-2026-11-24.md).

## Scope and isolation

- Build: `main` at `5950e016`, run with `pnpm dev` (persistence, API, UI), Node
  22.23.2, Chrome headless through Playwright, PostgreSQL 18.6 in a disposable
  container from `docker/local/resources.yml` (no persistent volume). Existing
  Docker volumes and the repository's `.env` files were not modified.
- Data: the repository's fixed demo seed (one user, 8 accounts, ~1,100 movements)
  plus data created by the run, which used the Fintoc **test** keys and the public
  Fintoc sandbox credentials from its documentation.
- Oracle: SQL run directly against PostgreSQL, independent of the UI/API, for
  balances, spending, budget, savings and persistence checks.
- Auth mode was `AUTH_PROVIDER=mock` (single fixed user). Real Firebase sign-in and
  two-user isolation were **not** exercised.
- The assistant used the configured OpenAI text model with synthetic data and a
  small number of prompts per run (repeated across development reruns; no exact
  token or cost count was recorded).

## Result: 49 of 49 checks passed

| Group | Checks | Scenarios |
| --- | --- | --- |
| Security and RLS | 5 | Unauthenticated/invalid access, signed private service, strict inputs, forced RLS with no/foreign context |
| Balances, spending, internal movements | 8 | J1, J2, J7; API vs SQL; metamorphic internal/external toggles |
| Budgets, savings goals, income | 9 | J3, J4, J5 (V06) |
| Text assistant (real model) | 6 | J9, J10, J14; V08 consent gating; exact approval |
| External MCP client (real OAuth) | 8 | J11, J17; V10; discovery, DCR, consent, PKCE, scopes, per-grant revocation |
| Fintoc sandbox (real hosted widget) | 8 | J8, J12; V02, V05 |
| Tags, onboarding, a11y, responsive | 5 | J13, J7; V06, V09 |
| Read performance | 1 | NFR p95 target of 500 ms |

Notable evidence:

- API spending equals the SQL sum of explicitly non-internal debits for the month
  (1,176,000 CLP); provider-imported movements with `unknown` assessment stay out and
  are reported as unresolved (28), as the Fintoc guide specifies. Resolving one makes
  it count by exactly its amount and reverting restores both figures.
- Budget spent matched SQL; an internal movement stopped consuming the limit.
  Savings net contributions matched SQL, including a legitimate negative net.
- Without accepted consent the server answered 403 and sent nothing to the model;
  with it, the assistant's balance and spending answers matched the database. A "yes"
  in chat did not execute a proposal; only the exact approval created one tag, once.
- A read-only OAuth token could not execute a valid write and created nothing. A
  reused code and a wrong PKCE verifier were rejected. Revoking one grant ended its
  access and refresh token without affecting a second grant.
- The Fintoc link stored an encrypted credential with no plaintext link token,
  imported nothing on authorization or discovery, imported only the selected
  accounts, produced no duplicates on a second import, kept a manual tag and alias,
  did not contact the provider when only reading status, and kept history after
  disconnect (refresh then returned 409).
- Axe (WCAG 2.x A/AA) found no violations in 48 scans (12 routes × light/dark ×
  360/1280 px) and there was no horizontal overflow. This is automated evidence
  only, not a complete accessibility audit.
- Read p95 (30 samples, one client, development mode): accounts 59 ms, movements
  74 ms, monthly summary 120 ms, budget progress 164 ms. This is **not** a load test
  and does not satisfy LAZ-108.

## Observations (not failures)

1. The seed stores 933 `manual` rows as explicitly external and 136 as internal
   without a user override while their provider assessment is `unknown`. Clearing an
   override ("Usar evaluación del proveedor") therefore turns such a row into an
   unresolved movement. Relevant to LAZ-105 (richer, consistent seed).
2. `tags.create` with an existing name is idempotent: it returns the existing tag and
   does not change its color. The UI tells the user "Ese nombre ya existe".
3. Writing with a read-only MCP token returns HTTP 200 with an MCP error result
   explaining that write permission is missing, not an HTTP 403. The documentation
   describes 403 for a token lacking `finance:read`.
4. All sandbox movements were dated on the link day, so the run did not prove that
   earlier provider history is excluded; it proved none was imported.

## Not executed

Real Firebase sign-in and two-user isolation (needs an interactive sign-in), live
voice (microphone), deployment verification (LAZ-106), measured load/performance
tests (LAZ-108), the mock banking provider (LAZ-107), a named commercial MCP client,
and any production-environment check. These remain open for the gate review.

## Reproduction

Scripts and evidence are kept outside the repository (Desktop `QA-LazyFinance`).
They require the Docker resources compose, migrated/seeded database, the three
services, and local credentials in the ignored `.env` files; they reset only data
created by the run. Do not run them against a development or user database.
