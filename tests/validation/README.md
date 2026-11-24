# Stage C real-stack validation suites

Opt-in, executed-evidence suites for LAZ-100 (selected live voice, model, identity and
banking flows) that run against the **local development stack**. They are not part of
`pnpm test`, `test:integration` or CI: they open listeners, contact external services
and write to a disposable database. Read [the run record](../../docs/planning/stage-c/laz100-validation-record-2026-11-24.md)
for what was executed and what remains manual.

## Evidence levels

Each case declares its level, following the [validation plan](../../docs/planning/stage-c/validation-plan.md).
A result is `passed`, `failed` or `blocked`; `blocked` (unmet precondition, missing
credential, manual session) is never counted as passed.

| Level | Meaning |
| --- | --- |
| `controlled` | Synthetic fixtures on the local stack, no external provider |
| `sandbox` | Provider test environment (Fintoc test keys and the public sandbox credentials from Fintoc's documentation) |
| `live` | Real provider session (Firebase Auth, configured model provider) with synthetic data |
| `manual` | Human-run session recorded in [laz100-manual-sessions.md](../../docs/planning/stage-c/laz100-manual-sessions.md) |

## Suites

| Suite | LAZ-100 criterion | Stack mode | Needs |
| --- | --- | --- | --- |
| `laz100-assistant.mjs` | 2 (text answers vs owned services) | mock auth (`pnpm dev`) | model key in `apps/api/.env`, demo seed |
| `laz100-mcp.mjs` | 4 (scripted OAuth client; **not** a named client) | mock auth (`pnpm dev`) | browser tooling, demo seed |
| `laz100-firebase.mjs` | 3 (two-user identity boundaries) | `AUTH_PROVIDER=firebase pnpm dev` | Firebase Admin credentials in `apps/api/.env` |
| `laz100-fintoc.mjs` | 3 (selection, cutoff, automatic sync, relink, recovery) | `AUTH_PROVIDER=firebase BANKING_AUTOMATIC_SYNC_ENABLED=true pnpm exec turbo dev --env-mode=loose` | Fintoc **test** keys, Firebase Admin credentials, browser tooling |

`--env-mode=loose` is used because `turbo.json` passes only a fixed list of variables to
`dev`, and `BANKING_*` is not among them; alternatively set the flag in `apps/api/.env`.

## Running

1. Start PostgreSQL (`pnpm resources:up`), migrate and seed it (see the
   [persistence README](../../apps/persistence/README.md)), then start the stack in the
   mode the suite needs.
2. Point to an external Playwright installation (the repository adds no dependency, like
   `apps/ui/tests/browser/workspace-contrast.mjs`) and tell the suite which auth mode it
   is running under, which is recorded in the result:

   ```sh
   export BROWSER_TOOLING_ROOT=/path/to/a/folder/with/playwright
   VALIDATION_AUTH_PROVIDER=mock node tests/validation/laz100-assistant.mjs
   VALIDATION_AUTH_PROVIDER=mock node tests/validation/laz100-mcp.mjs
   VALIDATION_AUTH_PROVIDER=firebase node tests/validation/laz100-firebase.mjs
   VALIDATION_AUTH_PROVIDER=firebase node tests/validation/laz100-fintoc.mjs
   ```

3. Results are written to `tests/validation/results/` (ignored by Git) as JSON that
   includes the session record: UTC time, commit, tracked-file changes, Node, OS,
   PostgreSQL and Chrome versions, auth provider and data class.

Optional environment: `VALIDATION_ONLY=AS-06,AS-07` runs selected cases;
`VALIDATION_REPEAT` sets prompt repetitions for the assistant suite (default 2);
`VALIDATION_API_URL`, `VALIDATION_UI_URL`, `VALIDATION_PG_CONTAINER`, `VALIDATION_CHROME`
and `VALIDATION_OUT` override the defaults in `lib.mjs`.

## Safety

- **Disposable database only.** The oracle queries and some setup steps write to the
  local Compose PostgreSQL (`docker exec`): the assistant suite truncates assistant
  tables, the MCP suite revokes grants, and the Fintoc suite alters a sandbox
  connection's stored credential for fault injection. Never point these at a
  development or user database.
- **Firebase.** The Firebase and Fintoc suites create disposable users
  (`qa-laz100-*@example.test`) in the configured Firebase project and delete them in a
  `finally` block. Rows they leave in the local database belong to the deleted users.
- **Cost and data.** The assistant suite sends a few short prompts per run to the
  configured model provider with the synthetic demo fixture only. The stream exposes no
  token counts, so none are recorded. The Fintoc suite uses sandbox keys; it says nothing
  about live bank entitlement, polling limits or cost.
- Secrets are read from the ignored `.env` files and never printed or written to results.

## Reading the results

- **Sandbox variability.** The Fintoc sandbox returned between one and three accounts and
  between zero and tens of movements across links, and reuses account ids across links.
  The suite therefore compares the facts of previously imported movements instead of raw
  counts, scopes account checks to the connection, and reports a case as `blocked` when the
  sandbox does not return enough accounts. Rerun the suite in that case.
- **Fault injection is labelled.** `FT-08a` stores a corrupted credential (a server
  configuration error, not a bank outcome). `FT-08b` stores a link token Fintoc does not
  know, which is not the same as a naturally expired bank link.
- **Not a load or capacity test.** Latency figures are single-client development-mode
  samples.
